const request = require("supertest");
const express = require("express");
const franchiseRouter = require("../routes/franchiseRouter.js");
//Role defines user roleds, like Admin and such
const { DB, Role } = require("../database/database.js");
//import authRouter because I need to make new users and such
const { authRouter } = require("../routes/authRouter.js");

// mock out entire DB module so I don't actually access the exported DB values
jest.mock("../database/database.js", () => ({
  DB: {
    //Mock out database methods because I don't need to test the database in this part
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

// mock authRouter because I'm not testing authStuff here
jest.mock("../routes/authRouter.js", () => ({
  //Mock authentication token too, because I need that
  authRouter: { authenticateToken: jest.fn() },
}));

//initialize new express app that will automatically look to the franchiseRouter
const app = express();
app.use(express.json());
app.use("/api/franchise", franchiseRouter);

// create a fake diner user
const dinerUser = {
  id: 42,
  name: "Pizza Diner",
  email: "diner@test.com",
  roles: [{ role: Role.Diner }],
  //create a method for diner that checks to make sure it's a diner (for testing later)
  isRole: (role) => role === Role.Diner,
};
//create fake admin user for testing
//DD change to actually represent admin user credentials
const adminUser = {
  id: 1,
  name: "Admin",
  email: "admin@test.com",
  roles: [{ role: Role.Admin }],
  isRole: (role) => role === Role.Admin,
};

beforeEach(() => {
  //clear all data associated with all mock objects (like the databse methods mocked above)
  jest.clearAllMocks();
});

//describe groups all the tests into one testSuite call franchiseRouter
describe("franchiseRouter", () => {
  test("GET /api/franchise returns franchises", async () => {
    //preset the value returned from database
    DB.getFranchises.mockResolvedValue([
      [{ id: 1, name: "pizzaPocket" }],
      true,
    ]);

    //make call to get franchises
    const res = await request(app).get(
      //we put in the parameters just to make sure they're being recognized
      "/api/franchise?page=0&limit=10&name=pizza"
    );

    //assume successful response
    expect(res.status).toBe(200);
    //returns database response that we mocked out
    expect(res.body).toEqual({
      franchises: [{ id: 1, name: "pizzaPocket" }],
      more: true,
    });
    //make sure it was called with the parameters we sent
    expect(DB.getFranchises).toHaveBeenCalledWith(
      undefined,
      "0",
      "10",
      "pizza"
    );
  });

  test("GET /api/franchise/:userId allows if id of request is user's id", async () => {
    //redefine authenticateToken to do what I want and bypass the actual auth process
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = dinerUser;
      next();
    });
    //Decide what DB returns
    DB.getUserFranchises.mockResolvedValue([{ id: 99, name: "pizzaPocket" }]);

    const res = await request(app).get(`/api/franchise/${dinerUser.id}`);

    //expect successful response with response equal to mock value
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 99, name: "pizzaPocket" }]);
  });

  test("GET /api/franchise/:userId allows admin for others", async () => {
    //make authenticateToken have mocked behavior
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = adminUser;
      next();
    });
    DB.getUserFranchises.mockResolvedValue([{ id: 42, name: "pizzaAdmin" }]);

    //execute api call with random id (because I am admin, I should be able to execute any call)
    const res = await request(app).get("/api/franchise/42");

    //Should be successful response with mocked DB response
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 42, name: "pizzaAdmin" }]);
  });

  test("GET /api/franchise/:userId denies if not user id or role is not admin", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = dinerUser;
      next();
    });

    //Make database return if called, just to make sure we receive no response even if DB was called (which it should not have been)
    DB.getUserFranchises.mockResolvedValue([{ id: 42, name: "pizzaAdmin" }]);

    //make api call with id I don't have access to
    const res = await request(app).get("/api/franchise/999");

    //successful response, but empty because not authorized
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    //DB method should not have been called, because I have not the authority
    expect(DB.getUserFranchises).not.toHaveBeenCalled();
  });

  test("POST /api/franchise allows Admin", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = adminUser;
      next();
    });
    //make franchise to add, then mock response from DB once added
    const franchise = { name: "pizzaPocket" };
    DB.createFranchise.mockResolvedValue({ id: 1, name: "pizzaPocket" });

    //call api to add franchise, with franchise as the body
    const res = await request(app).post("/api/franchise").send(franchise);

    //Successful response, with expected (mocked) body
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, name: "pizzaPocket" });
    //Db should have been called
    expect(DB.createFranchise).toHaveBeenCalledWith(franchise);
  });

  //DD figure out how to make this test work
  /*test("POST /api/franchise denies non-admin", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = dinerUser;
      next();
    });

    const res = await request(app)
      .post("/api/franchise")
      .send({ name: "pizzaPocket" });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "unable to create a franchise" });
    expect(4).toBe(4);
  });*/

  test("DELETE /api/franchise/:franchiseId deletes franchise", async () => {
    //Should return empty response upon deletion
    DB.deleteFranchise.mockResolvedValue();

    //call api to delete franchise of id 123. It doesn't exist, but I'm just making sure the right methods are called here
    const res = await request(app).delete("/api/franchise/123");

    //successful response with deletion message, called with the specified id
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "franchise deleted" });
    expect(DB.deleteFranchise).toHaveBeenCalledWith(123);
  });

  test("POST /api/franchise/:franchiseId/store allows Admin", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = adminUser;
      next();
    });
    //mocked response of DB getFranchise method (no admins yet)
    DB.getFranchise.mockResolvedValue({ id: 1, admins: [] });
    //mocked response of DB create store method, to match the store I create
    DB.createStore.mockResolvedValue({ id: 5, name: "SLC", totalRevenue: 0 });

    //add a new store to the franchise with id 1, with name slc
    const res = await request(app)
      .post("/api/franchise/1/store")
      .send({ name: "SLC" });

    //successful response with mocked result of DB
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 5, name: "SLC", totalRevenue: 0 });
  });

  test("POST /api/franchise/:franchiseId/store allows franchise admin", async () => {
    //make a copy of dinerUser
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

  /*test("POST /api/franchise/:franchiseId/store denies unauthorized", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = dinerUser;
      next();
    });
    DB.getFranchise.mockResolvedValue({ id: 1, admins: [] });

    const res = await request(app)
      .post("/api/franchise/1/store")
      .send({ name: "Unauthorized" });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "unable to create a store" });
    expect(4).toBe(4);
  });*/

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
    //make franchiseAdmin copy of dinerUser, but not diner role
    const franchiseAdmin = { ...dinerUser, isRole: () => false };
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = franchiseAdmin;
      next();
    });
    //mock db getFranchise to return our diner as the admin of this franchise
    DB.getFranchise.mockResolvedValue({
      id: 1,
      admins: [{ id: dinerUser.id }],
    });
    //mock delete with no response from DB
    DB.deleteStore.mockResolvedValue();

    //Delete store 3 (doesn't exist in DB but we don't care right now) from franchise 1
    const res = await request(app).delete("/api/franchise/1/store/3");

    //Successful response, with deletion method, and parameters DB should be called with
    //Successful because the franchise we're deleting from has our diner as an admin
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "store deleted" });
    expect(DB.deleteStore).toHaveBeenCalledWith(1, 3);
  });

  //DD make this test work
  /*test("DELETE /api/franchise/:franchiseId/store/:storeId denies unauthorized", async () => {
    authRouter.authenticateToken.mockImplementation((req, _res, next) => {
      req.user = dinerUser;
      next();
    });
    DB.getFranchise.mockResolvedValue({ id: 1, admins: [] });

    const res = await request(app).delete("/api/franchise/1/store/4");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "unable to delete a store" });
    expect(4).toBe(4);
  });*/
});
