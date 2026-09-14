import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createUser, createGroup, addMember, authHeader } from "./helpers.js";
import { GroupMember } from "../src/models/GroupMember.js";

const app = createApp();

describe("Group CRUD", () => {
  it("lets a Super Admin create a group", async () => {
    const { user: superAdmin } = await createUser({ role: "SUPER_ADMIN" });

    const res = await request(app)
      .post("/api/groups")
      .set(authHeader(superAdmin))
      .send({ name: "Engineering", description: "Eng team chat" });

    expect(res.status).toBe(201);
    expect(res.body.group.name).toBe("Engineering");
  });

  it("blocks a normal user from creating a group", async () => {
    const { user } = await createUser();

    const res = await request(app).post("/api/groups").set(authHeader(user)).send({ name: "Nope" });
    expect(res.status).toBe(403);
  });

  it("deleting a group cascades to its memberships", async () => {
    const { user: superAdmin } = await createUser({ role: "SUPER_ADMIN" });
    const { user: member } = await createUser();
    const group = await createGroup({ createdBy: superAdmin });
    await addMember(group._id, member._id);

    const res = await request(app).delete(`/api/groups/${group._id}`).set(authHeader(superAdmin));
    expect(res.status).toBe(200);

    const remaining = await GroupMember.countDocuments({ groupId: group._id });
    expect(remaining).toBe(0);
  });
});

describe("Group membership", () => {
  it("only adds already-ACTIVE users to a group", async () => {
    const { user: superAdmin } = await createUser({ role: "SUPER_ADMIN" });
    const { user: pendingUser } = await createUser({ status: "PENDING" });
    const group = await createGroup({ createdBy: superAdmin });

    const res = await request(app)
      .post(`/api/groups/${group._id}/members`)
      .set(authHeader(superAdmin))
      .send({ userId: pendingUser._id.toString() });

    expect(res.status).toBe(400);
  });

  it("lets a re-added member rejoin cleanly after being removed", async () => {
    const { user: superAdmin } = await createUser({ role: "SUPER_ADMIN" });
    const { user: member } = await createUser();
    const group = await createGroup({ createdBy: superAdmin });
    await addMember(group._id, member._id);

    await request(app)
      .delete(`/api/groups/${group._id}/members/${member._id}`)
      .set(authHeader(superAdmin));

    const res = await request(app)
      .post(`/api/groups/${group._id}/members`)
      .set(authHeader(superAdmin))
      .send({ userId: member._id.toString() });

    expect(res.status).toBe(200);
    const membership = await GroupMember.findOne({ groupId: group._id, userId: member._id });
    expect(membership.status).toBe("ACTIVE");
  });

  it("demote is blocked if it would leave zero Group Admins", async () => {
    const { user: superAdmin } = await createUser({ role: "SUPER_ADMIN" });
    const { user: admin } = await createUser();
    const group = await createGroup({ createdBy: superAdmin });
    await addMember(group._id, admin._id, "GROUP_ADMIN");

    const res = await request(app)
      .post(`/api/groups/${group._id}/members/${admin._id}/demote`)
      .set(authHeader(superAdmin));

    expect(res.status).toBe(400);
  });
});
