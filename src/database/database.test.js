const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const { Role, DB } = require("../database/database");
const dbModel = require("../database/dbModel");

//DD this doesn't actually interact with a real database. A good future project would be to alter these tests so they interact with the temporary databse hosted on Github
//mock out mysql2/promise module
//mysql1 is a node js library for connecting to MySQL
// /promise means all database methods return promises instead of using callbacks
jest.mock("mysql2/promise");
jest.mock("bcrypt");

describe("DB class", () => {
  let mockConn;

  beforeEach(() => {
    //make a fake connection, with every sql coommand as a mock object
    mockConn = {
      execute: jest.fn(),
      query: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      end: jest.fn(),
    };
    mysql.createConnection.mockResolvedValue(mockConn);
    //mock my bcrypt to make an easier to recognize hashed password
    bcrypt.hash.mockImplementation(async (pw) => `hashed-${pw}`);
    bcrypt.compare.mockImplementation(
      async (pw, hash) => hash === `hashed-${pw}`
    );
  });

  afterEach(() => {
    //make sure all Mocks are returned to their original implementation
    jest.restoreAllMocks();
  });

  //This test has so much mocking for such little logic that it's not very useful unless I work with an actual database
  test("getMenu returns rows", async () => {
    //make the connection action return the mock value, just the next time
    mockConn.execute.mockResolvedValueOnce([[{ id: 1, title: "Veggie" }]]);
    const rows = await DB.getMenu();
    expect(rows).toEqual([{ id: 1, title: "Veggie" }]);
    //make sure connection has been closed
    expect(mockConn.end).toHaveBeenCalled();
  });

  //This test tests the logic of the DB method, but until I am actually testing the DB, there's not a lot of logic to test
  test("addMenuItem inserts and returns item with id", async () => {
    //Should return 42
    mockConn.execute.mockResolvedValueOnce([{ insertId: 42 }]);
    const result = await DB.addMenuItem({
      title: "x",
      description: "y",
      image: "z",
      price: 1,
    });
    expect(result).toMatchObject({ id: 42 });
  });

  //This test more tests code implementation than functionality. Would be good to refactor to interact with a sample database
  test("addUser inserts user and roles", async () => {
    //make expected return values for db query/insert calls (second one doesn't matter, it just needs to be mocked)
    mockConn.execute
      .mockResolvedValueOnce([{ insertId: 10 }]) // user insert
      .mockResolvedValueOnce([{ insertId: 1 }]); // userRole insert
    const result = await DB.addUser({
      name: "a",
      email: "b",
      password: "c",
      roles: [{ role: Role.Admin }],
    });
    expect(result).toMatchObject({ id: 10, password: undefined });
  });

  //this test is good, and doesn't need any improvement, since it's just handling bad password logic
  test("getUser fails on bad password", async () => {
    //make sample user-info returned
    mockConn.execute.mockResolvedValueOnce([
      [{ id: 1, email: "x", password: "hashed-bad" }],
    ]); // user
    //trying to sign in with an email and wrong password throws an unknown user error
    await expect(DB.getUser("x", "wrong")).rejects.toThrow("unknown user");
  });

  //this test has coverage but is not great. It basically mocks out the DB calls and their responses, and makes sure the end thing exists. Could be improved with DB interaction
  test("updateUser builds update query and calls getUser", async () => {
    mockConn.execute
      // First call: UPDATE user (no results needed, return [{}] inside array)
      .mockResolvedValueOnce([{}, []])
      // Second call: SELECT * FROM user (return rows array + fields)
      .mockResolvedValueOnce([
        [{ id: 1, email: "e", password: "hashed-p" }],
        [],
      ])
      // Third call: SELECT * FROM userRole (empty roles, return [] + fields)
      .mockResolvedValueOnce([[], []]);

    const result = await DB.updateUser(1, "n", "e", "p");
    expect(result).toHaveProperty("roles");
  });

  //Making sure that when I login, I am going ahead and inserting an AUTH token
  test("loginUser inserts into auth", async () => {
    mockConn.execute.mockResolvedValueOnce([]);
    await DB.loginUser(1, "a.b.c");
    expect(mockConn.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO auth"),
      expect.any(Array)
    );
  });

  //Create a mock user to be found, then return true when there is at least 1 result
  test("isLoggedIn returns true when found", async () => {
    mockConn.execute.mockResolvedValueOnce([[{ userId: 1 }]]);
    const result = await DB.isLoggedIn("a.b.c");
    expect(result).toBe(true);
  });

  //Just makes sure that the logout method deletes from the Auth table
  test("logoutUser deletes from auth", async () => {
    mockConn.execute.mockResolvedValueOnce([]);
    await DB.logoutUser("a.b.c");
    expect(mockConn.execute).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM auth"),
      expect.any(Array)
    );
  });

  //uses mocking to make sure that all DB calls are made, and that the correct result (in this case, 5) is returned
  test("addDinerOrder inserts order and items", async () => {
    mockConn.execute
      .mockResolvedValueOnce([{ insertId: 5 }]) // order
      .mockResolvedValueOnce([[{ id: 99 }]]) // menu id
      .mockResolvedValueOnce([]); // insert item
    const order = {
      franchiseId: 1,
      storeId: 2,
      items: [{ menuId: 10, description: "d", price: 1 }],
    };
    const result = await DB.addDinerOrder({ id: 1 }, order);
    expect(result).toHaveProperty("id", 5);
  });

  //Make the admin user lookup fail if no admin user is found with the given credentials. This is an important test
  test("createFranchise throws if unknown admin", async () => {
    mockConn.execute.mockResolvedValueOnce([[]]); // no user
    await expect(
      DB.createFranchise({ name: "f", admins: [{ email: "nope" }] })
    ).rejects.toThrow("unknown user");
  });

  //Make sure if there's an error deleting a franchise, that we have DB rollback and an error is thrown. This is also important
  test("deleteFranchise rolls back on error", async () => {
    mockConn.beginTransaction.mockResolvedValue();
    mockConn.execute.mockRejectedValueOnce(new Error("fail"));
    mockConn.rollback.mockResolvedValue();
    await expect(DB.deleteFranchise(1)).rejects.toThrow(
      "unable to delete franchise"
    );
    expect(mockConn.rollback).toHaveBeenCalled();
  });

  //??
  test("getFranchises trims extra and calls getFranchise if admin", async () => {
    mockConn.execute
      .mockResolvedValueOnce([
        [
          { id: 1, name: "n" },
          { id: 2, name: "n2" },
        ],
      ]) // franchises
      .mockResolvedValueOnce([[{ id: 1 }]]) // franchise.admins
      .mockResolvedValueOnce([[{ id: 1 }]]); // franchise.stores
    const user = { isRole: (r) => r === Role.Admin };
    const [franchises, more] = await DB.getFranchises(user, 0, 1, "*");
    expect(franchises.length).toBe(1);
    expect(more).toBe(true);
  });

  //Pretty self explanatory, maybe not necessary, but return an empty array when there are no rows returned from the query
  test("getUserFranchises returns empty when no rows", async () => {
    mockConn.execute.mockResolvedValueOnce([[]]);
    const res = await DB.getUserFranchises(1);
    expect(res).toEqual([]);
  });

  //With the little logic tested here, the mocking makes this test almost guaranteed to pass. Interacting with an actual databse would be better here
  test("createStore inserts and returns store", async () => {
    mockConn.execute.mockResolvedValueOnce([{ insertId: 77 }]);
    const store = await DB.createStore(1, { name: "SLC" });
    expect(store).toEqual({ id: 77, franchiseId: 1, name: "SLC" });
  });

  //just make sure that delete DB method called correctly. This would be better with a sample database
  test("deleteStore deletes store", async () => {
    mockConn.execute.mockResolvedValueOnce([]);
    await DB.deleteStore(1, 2);
    expect(mockConn.execute).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM store"),
      [1, 2]
    );
  });

  //Testing simple logic in getTokenSignature. I'm not too familiar with the reasoning for the getTokenSignature method, so this may be more testing implementation than functionality. We'll see
  test("getTokenSignature returns third part or empty", () => {
    expect(DB.getTokenSignature("a.b.c")).toBe("c");
    expect(DB.getTokenSignature("a.b")).toBe("");
  });

  //Most important test here: make sure that if no ID is found, an error is thrown, because this really should not happen
  test("getID returns id or throws", async () => {
    mockConn.execute.mockResolvedValueOnce([[{ id: 55 }]]);
    expect(await DB.getID(mockConn, "id", 1, "menu")).toBe(55);
    mockConn.execute.mockResolvedValueOnce([[]]);
    await expect(DB.getID(mockConn, "id", 1, "menu")).rejects.toThrow(
      "No ID found"
    );
  });

  //Because I'm not interacting with an actual initialized database here, this is mostly mocking and making sure the right things have been called. I don't know how useful this test is
  test("initializeDatabase creates database and tables", async () => {
    mockConn.execute.mockResolvedValueOnce([[{ SCHEMA_NAME: "db" }]]);
    mockConn.query.mockResolvedValue([]);
    dbModel.tableCreateStatements = ["CREATE TABLE foo (id int)"];
    await DB.initializeDatabase();
    expect(mockConn.query).toHaveBeenCalled();
  });
});
