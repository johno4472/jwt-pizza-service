const request = require("supertest");
const express = require("express");
const userRouter = require("../routes/userRouter.js");
const { DB, Role } = require("../database/database.js");
const { authRouter, setAuth } = require("../routes/authRouter.js");

// mock DB module with mock objects for updateUser specifically
jest.mock("../database/database.js", () => ({
  DB: {
    updateUser: jest.fn(),
  },
  Role: { Admin: "admin", Diner: "diner" },
}));

//also mock out authRouther module with a mock authenticateToken method and setAuth
//(since we don't care if that works in this implementation)
jest.mock("../routes/authRouter.js", () => ({
  authRouter: { authenticateToken: jest.fn() },
  setAuth: jest.fn(),
}));

//Create express app that just uses userRouter
const app = express();
app.use(express.json());
app.use("/api/user", userRouter);

// make a mock dinerUser
const dinerUser = {
  id: 42,
  name: "Pizza Diner",
  email: "diner@test.com",
  roles: [{ role: Role.Diner }],
  isRole: (role) => role === Role.Diner,
};

//make a mock adminUser
const adminUser = {
  id: 1,
  name: "Admin User",
  email: "admin@test.com",
  roles: [{ role: Role.Admin }],
  isRole: (role) => role === Role.Admin,
};

//Make sure each mock object has data cleared before each test
beforeEach(() => {
  jest.clearAllMocks();
});

describe("userRouter", () => {
  //DD make this test work
  /*test("GET /api/user/me returns authenticated user", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = dinerUser;
      next();
    });

    const res = await request(app).get("/api/user/me");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(dinerUser);
    expect(4).toBe(4);
  });*/

  //DD make this test work
  /*test("PUT /api/user/:userId allows user to update self", async () => {
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
    expect(res.body).toEqual({ user: updatedUser, token: "new-jwt" });
    expect(4).toBe(4);
  });*/

  test("PUT /api/user/:userId allows Admin to update another user", async () => {
    //make authenticateToken work, and set user to adminUser
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = adminUser;
      next();
    });

    //set other user Id to one that's not ours, to make sure Admin can access it
    const otherUserId = 999;
    const updateBody = {
      name: "Target",
      email: "target@test.com",
      password: "pw",
    };
    //make updatedUser object to pass in
    const updatedUser = {
      id: otherUserId,
      ...updateBody,
      roles: [{ role: Role.Diner }],
    };
    //make DB return updatedUser when updateUser called
    DB.updateUser.mockResolvedValue(updatedUser);
    //make authToken set with something we can use later to bypass all that auth stuff
    setAuth.mockResolvedValue("admin-jwt");

    //api call to update a different user with the userinfo as the body
    const res = await request(app)
      .put(`/api/user/${otherUserId}`)
      .send(updateBody);

    //successful response, with params we sepcified for DB method
    expect(res.status).toBe(200);
    expect(DB.updateUser).toHaveBeenCalledWith(
      otherUserId,
      updateBody.name,
      updateBody.email,
      updateBody.password
    );
    //make sure setAuth was called, and gives us back the new token we mocked out
    expect(setAuth).toHaveBeenCalledWith(updatedUser);
    expect(res.body).toEqual({ user: updatedUser, token: "admin-jwt" });
  });

  test("PUT /api/user/:userId denies if not the user you want or Admin", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = dinerUser;
      next();
    });

    //make another user that we don't have access to when we try to update
    const otherUserId = 99;
    const res = await request(app).put(`/api/user/${otherUserId}`).send({
      name: "Nope",
      email: "no@test.com",
      password: "pw",
    });

    //should be unsuccessful, unauthorized, and DB method and setAuth method not called because it's illegal :)
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "unauthorized" });
    expect(DB.updateUser).not.toHaveBeenCalled();
    expect(setAuth).not.toHaveBeenCalled();
  });
});
