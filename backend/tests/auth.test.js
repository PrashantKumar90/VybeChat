import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { createUser } from "./helpers.js";

// Never hit real SMTP during tests.
vi.mock("../src/services/email.service.js", () => ({
  sendRegistrationReceivedEmail: vi.fn().mockResolvedValue(),
  sendRegistrationApprovedEmail: vi.fn().mockResolvedValue(),
  sendRegistrationRejectedEmail: vi.fn().mockResolvedValue(),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(),
}));

const app = createApp();

describe("POST /api/auth/register", () => {
  it("creates a PENDING account for a new email", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "new@example.com" });

    expect(res.status).toBe(201);
    const user = await User.findOne({ email: "new@example.com" });
    expect(user.status).toBe("PENDING");
    expect(user.passwordHash).toBeNull(); // no password until account setup
  });

  it("rejects a duplicate email", async () => {
    await createUser();
    const { user } = await createUser();
    const res = await request(app).post("/api/auth/register").send({ email: user.email });
    expect(res.status).toBe(409);
  });

  it("rejects an invalid email", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in an ACTIVE user with the correct password", async () => {
    const { user, password } = await createUser({ status: "ACTIVE" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ identifier: user.email, password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(user.email);
  });

  it("rejects the wrong password", async () => {
    const { user } = await createUser({ status: "ACTIVE" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ identifier: user.email, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("rejects a SUSPENDED account even with the correct password", async () => {
    const { user, password } = await createUser({ status: "SUSPENDED" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ identifier: user.email, password });
    expect(res.status).toBe(403);
  });

  it("logs in by username as well as email", async () => {
    const { user, password } = await createUser({ status: "ACTIVE" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ identifier: user.username, password });
    expect(res.status).toBe(200);
  });
});
