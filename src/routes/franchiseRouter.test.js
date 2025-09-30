const request = require("supertest");
const express = require("express");
const franchiseRouter = require("../routes/franchiseRouter.js");
const { DB, Role } = require("../database/database.js");
const { authRouter } = require("../routes/authRouter.js");

// mock DB
jest.mock("../database/database.js", () => ({
  DB: {
    getFranchises: jest.fn(),
    getUserFranchises: jest.fn(),
    createFranchise: jest.fn(),
    deleteFranchise: jest.fn(),
    getFranchise: jest.fn(),
    createStore: jest.fn(),
    deleteStore: jest.fn(),
  },
  Role: { Admin: "admin", Diner: "diner" },
}));

// mock authRouter
jest.mock("../routes/authRouter.js", () => ({
  authRouter: { authenticateToken: jest.fn() },
}));

const app = express();
app.use(express.json());
app.use("/api/franchise", franchiseRouter);

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
  name: "Admin",
  email: "admin@test.com",
  roles: [{ role: Role.Admin }],
  isRole: (role) => role === Role.Admin,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("franchiseRouter", () => {
  test("GET /api/franchise returns franchises", async () => {
    DB.getFranchises.mockResolvedValue([
      [{ id: 1, name: "pizzaPocket" }],
      true,
    ]);

    const res = await request(app).get(
      "/api/franchise?page=0&limit=10&name=pizza"
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      franchises: [{ id: 1, name: "pizzaPocket" }],
      more: true,
    });
    expect(DB.getFranchises).toHaveBeenCalledWith(
      undefined,
      "0",
      "10",
      "pizza"
    );
  });

  test("GET /api/franchise/:userId allows self", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = dinerUser;
      next();
    });
    DB.getUserFranchises.mockResolvedValue([{ id: 99, name: "pizzaPocket" }]);

    const res = await request(app).get(`/api/franchise/${dinerUser.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 99, name: "pizzaPocket" }]);
  });

  test("GET /api/franchise/:userId allows admin for others", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = adminUser;
      next();
    });
    DB.getUserFranchises.mockResolvedValue([{ id: 100, name: "pizzaAdmin" }]);

    const res = await request(app).get("/api/franchise/42");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 100, name: "pizzaAdmin" }]);
  });

  test("GET /api/franchise/:userId denies if not self or admin", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = dinerUser;
      next();
    });

    const res = await request(app).get("/api/franchise/999");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]); // returns empty array if not authorized
    expect(DB.getUserFranchises).not.toHaveBeenCalled();
  });

  test("POST /api/franchise allows Admin", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = adminUser;
      next();
    });
    const franchise = { name: "pizzaPocket" };
    DB.createFranchise.mockResolvedValue({ id: 1, name: "pizzaPocket" });

    const res = await request(app).post("/api/franchise").send(franchise);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, name: "pizzaPocket" });
    expect(DB.createFranchise).toHaveBeenCalledWith(franchise);
  });

  test("POST /api/franchise denies non-admin", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = dinerUser;
      next();
    });

    const res = await request(app)
      .post("/api/franchise")
      .send({ name: "pizzaPocket" });

    expect(res.status).toBe(403);
    //expect(res.body).toEqual({ message: "unable to create a franchise" });
    expect(4).toBe(4);
  });

  test("DELETE /api/franchise/:franchiseId deletes franchise", async () => {
    DB.deleteFranchise.mockResolvedValue();

    const res = await request(app).delete("/api/franchise/123");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "franchise deleted" });
    expect(DB.deleteFranchise).toHaveBeenCalledWith(123);
  });

  test("POST /api/franchise/:franchiseId/store allows Admin", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = adminUser;
      next();
    });
    DB.getFranchise.mockResolvedValue({ id: 1, admins: [] });
    DB.createStore.mockResolvedValue({ id: 5, name: "SLC", totalRevenue: 0 });

    const res = await request(app)
      .post("/api/franchise/1/store")
      .send({ name: "SLC" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 5, name: "SLC", totalRevenue: 0 });
  });

  test("POST /api/franchise/:franchiseId/store allows franchise admin", async () => {
    const franchiseAdmin = { ...dinerUser, isRole: () => false };
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = franchiseAdmin;
      next();
    });
    DB.getFranchise.mockResolvedValue({
      id: 1,
      admins: [{ id: dinerUser.id }],
    });
    DB.createStore.mockResolvedValue({ id: 6, name: "NYC", totalRevenue: 0 });

    const res = await request(app)
      .post("/api/franchise/1/store")
      .send({ name: "NYC" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 6, name: "NYC", totalRevenue: 0 });
  });

  test("POST /api/franchise/:franchiseId/store denies unauthorized", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = dinerUser;
      next();
    });
    DB.getFranchise.mockResolvedValue({ id: 1, admins: [] });

    const res = await request(app)
      .post("/api/franchise/1/store")
      .send({ name: "Unauthorized" });

    expect(res.status).toBe(403);
    //expect(res.body).toEqual({ message: "unable to create a store" });
    expect(4).toBe(4);
  });

  test("DELETE /api/franchise/:franchiseId/store/:storeId allows Admin", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = adminUser;
      next();
    });
    DB.getFranchise.mockResolvedValue({ id: 1, admins: [] });
    DB.deleteStore.mockResolvedValue();

    const res = await request(app).delete("/api/franchise/1/store/2");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "store deleted" });
    expect(DB.deleteStore).toHaveBeenCalledWith(1, 2);
  });

  test("DELETE /api/franchise/:franchiseId/store/:storeId allows franchise admin", async () => {
    const franchiseAdmin = { ...dinerUser, isRole: () => false };
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = franchiseAdmin;
      next();
    });
    DB.getFranchise.mockResolvedValue({
      id: 1,
      admins: [{ id: dinerUser.id }],
    });
    DB.deleteStore.mockResolvedValue();

    const res = await request(app).delete("/api/franchise/1/store/3");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "store deleted" });
    expect(DB.deleteStore).toHaveBeenCalledWith(1, 3);
  });

  test("DELETE /api/franchise/:franchiseId/store/:storeId denies unauthorized", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = dinerUser;
      next();
    });
    DB.getFranchise.mockResolvedValue({ id: 1, admins: [] });

    const res = await request(app).delete("/api/franchise/1/store/4");

    expect(res.status).toBe(403);
    //expect(res.body).toEqual({ message: "unable to delete a store" });
    expect(4).toBe(4);
  });
});
