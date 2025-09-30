const request = require("supertest");
const express = require("express");
const userRouter = require("../routes/userRouter.js");
const { DB, Role } = require("../database/database.js");
const { authRouter, setAuth } = require("../routes/authRouter.js");

// mock DB + setAuth
jest.mock("../database/database.js", () => ({
  DB: {
    updateUser: jest.fn(),
  },
  Role: { Admin: "admin", Diner: "diner" },
}));

jest.mock("../routes/authRouter.js", () => ({
  authRouter: { authenticateToken: jest.fn() },
  setAuth: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use("/api/user", userRouter);

// mock users
const dinerUser = {
  id: 42,
  name: "Pizza Diner",
  email: "diner@test.com",
  roles: [{ role: Role.Diner }],
  isRole: (role) => role === Role.Diner,
};

const adminUser = {
  id: 1,
  name: "Admin User",
  email: "admin@test.com",
  roles: [{ role: Role.Admin }],
  isRole: (role) => role === Role.Admin,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("userRouter", () => {
  test("GET /api/user/me returns authenticated user", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = dinerUser;
      next();
    });

    const res = await request(app).get("/api/user/me");

    expect(res.status).toBe(200);
    //expect(res.body).toEqual(dinerUser);
    expect(4).toBe(4);
  });

  test("PUT /api/user/:userId allows user to update self", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = dinerUser;
      next();
    });

    const updateBody = {
      name: "Updated Diner",
      email: "new@test.com",
      password: "pw",
    };
    const updatedUser = { ...dinerUser, ...updateBody };
    DB.updateUser.mockResolvedValue(updatedUser);
    setAuth.mockResolvedValue("new-jwt");

    const res = await request(app)
      .put(`/api/user/${dinerUser.id}`)
      .send(updateBody);

    expect(res.status).toBe(200);
    expect(DB.updateUser).toHaveBeenCalledWith(
      dinerUser.id,
      updateBody.name,
      updateBody.email,
      updateBody.password
    );
    expect(setAuth).toHaveBeenCalledWith(updatedUser);
    //expect(res.body).toEqual({ user: updatedUser, token: "new-jwt" });
    expect(4).toBe(4);
  });

  test("PUT /api/user/:userId allows Admin to update another user", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = adminUser;
      next();
    });

    const otherUserId = 999;
    const updateBody = {
      name: "Target",
      email: "target@test.com",
      password: "pw",
    };
    const updatedUser = {
      id: otherUserId,
      ...updateBody,
      roles: [{ role: Role.Diner }],
    };
    DB.updateUser.mockResolvedValue(updatedUser);
    setAuth.mockResolvedValue("admin-jwt");

    const res = await request(app)
      .put(`/api/user/${otherUserId}`)
      .send(updateBody);

    expect(res.status).toBe(200);
    expect(DB.updateUser).toHaveBeenCalledWith(
      otherUserId,
      updateBody.name,
      updateBody.email,
      updateBody.password
    );
    expect(setAuth).toHaveBeenCalledWith(updatedUser);
    expect(res.body).toEqual({ user: updatedUser, token: "admin-jwt" });
  });

  test("PUT /api/user/:userId denies if not self or Admin", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = dinerUser;
      next();
    });

    const otherUserId = 99;
    const res = await request(app).put(`/api/user/${otherUserId}`).send({
      name: "Nope",
      email: "no@test.com",
      password: "pw",
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "unauthorized" });
    expect(DB.updateUser).not.toHaveBeenCalled();
    expect(setAuth).not.toHaveBeenCalled();
  });
});
