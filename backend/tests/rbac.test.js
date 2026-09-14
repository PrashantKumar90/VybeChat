import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createUser, createGroup, addMember, authHeader } from "./helpers.js";

const app = createApp();

describe("Group access authorization", () => {
  it("denies a non-member access to a group", async () => {
    const { user: outsider } = await createUser();
    const group = await createGroup();

    const res = await request(app)
      .get(`/api/groups/${group._id}`)
      .set(authHeader(outsider));

    expect(res.status).toBe(403);
  });

  it("allows an active member to access their group", async () => {
    const { user: member } = await createUser();
    const group = await createGroup();
    await addMember(group._id, member._id);

    const res = await request(app).get(`/api/groups/${group._id}`).set(authHeader(member));
    expect(res.status).toBe(200);
  });

  it("lets the Super Admin access every group without being a member", async () => {
    const { user: superAdmin } = await createUser({ role: "SUPER_ADMIN" });
    const group = await createGroup();

    const res = await request(app).get(`/api/groups/${group._id}`).set(authHeader(superAdmin));
    expect(res.status).toBe(200);
  });

  it("rejects a SUSPENDED user's token on any protected route", async () => {
    const { user: suspended } = await createUser({ status: "SUSPENDED" });
    const group = await createGroup();

    const res = await request(app).get(`/api/groups/${group._id}`).set(authHeader(suspended));
    expect(res.status).toBe(403);
  });
});

describe("Group Admin is scoped per-group, not global", () => {
  it("gives a Group Admin no special rights in a different group", async () => {
    const { user: admin } = await createUser();
    const groupA = await createGroup();
    const groupB = await createGroup();
    await addMember(groupA._id, admin._id, "GROUP_ADMIN");
    await addMember(groupB._id, admin._id, "MEMBER"); // plain member in B

    const okInA = await request(app)
      .get(`/api/groups/${groupA._id}/admin-only-ping`)
      .set(authHeader(admin));
    const blockedInB = await request(app)
      .get(`/api/groups/${groupB._id}/admin-only-ping`)
      .set(authHeader(admin));

    expect(okInA.status).toBe(200);
    expect(blockedInB.status).toBe(403);
  });

  it("blocks a plain member from removing another member", async () => {
    const { user: member } = await createUser();
    const { user: target } = await createUser();
    const group = await createGroup();
    await addMember(group._id, member._id, "MEMBER");
    await addMember(group._id, target._id, "MEMBER");

    const res = await request(app)
      .delete(`/api/groups/${group._id}/members/${target._id}`)
      .set(authHeader(member));

    expect(res.status).toBe(403);
  });

  it("blocks a Group Admin from removing another Group Admin (Super Admin only)", async () => {
    const { user: admin1 } = await createUser();
    const { user: admin2 } = await createUser();
    const group = await createGroup();
    await addMember(group._id, admin1._id, "GROUP_ADMIN");
    await addMember(group._id, admin2._id, "GROUP_ADMIN");

    const res = await request(app)
      .delete(`/api/groups/${group._id}/members/${admin2._id}`)
      .set(authHeader(admin1));

    expect(res.status).toBe(403);
  });
});

describe("Lone Group Admin cannot leave unmanaged (spec §15)", () => {
  it("blocks leaving when this admin is the only one", async () => {
    const { user: admin } = await createUser();
    const group = await createGroup();
    await addMember(group._id, admin._id, "GROUP_ADMIN");

    const res = await request(app).post(`/api/groups/${group._id}/leave`).set(authHeader(admin));
    expect(res.status).toBe(400);
  });

  it("allows leaving once a second Group Admin exists", async () => {
    const { user: admin1 } = await createUser();
    const { user: admin2 } = await createUser();
    const group = await createGroup();
    await addMember(group._id, admin1._id, "GROUP_ADMIN");
    await addMember(group._id, admin2._id, "GROUP_ADMIN");

    const res = await request(app).post(`/api/groups/${group._id}/leave`).set(authHeader(admin1));
    expect(res.status).toBe(200);
  });
});
