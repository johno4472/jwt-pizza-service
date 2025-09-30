const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const { Role, DB } = require("../database/database");
const dbModel = require("../database/dbModel");

jest.mock("mysql2/promise");
jest.mock("bcrypt");

describe("DB class", () => {
  let mockConn;

  beforeEach(() => {
    mockConn = {
      execute: jest.fn(),
      query: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      end: jest.fn(),
    };
    mysql.createConnection.mockResolvedValue(mockConn);
    bcrypt.hash.mockImplementation(async (pw) => `hashed-${pw}`);
    bcrypt.compare.mockImplementation(
      async (pw, hash) => hash === `hashed-${pw}`
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("getMenu returns rows", async () => {
    mockConn.execute.mockResolvedValueOnce([[{ id: 1, title: "Veggie" }]]);
    const rows = await DB.getMenu();
    expect(rows).toEqual([{ id: 1, title: "Veggie" }]);
    expect(mockConn.end).toHaveBeenCalled();
  });

  test("addMenuItem inserts and returns item with id", async () => {
    mockConn.execute.mockResolvedValueOnce([{ insertId: 42 }]);
    const result = await DB.addMenuItem({
      title: "x",
      description: "y",
      image: "z",
      price: 1,
    });
    expect(result).toMatchObject({ id: 42 });
  });

  test("addUser inserts user and roles", async () => {
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

  test("getUser fails on bad password", async () => {
    mockConn.execute
      .mockResolvedValueOnce([[{ id: 1, email: "x", password: "hashed-bad" }]]) // user
      .mockResolvedValueOnce([]); // roles
    bcrypt.compare.mockResolvedValue(false);
    await expect(DB.getUser("x", "wrong")).rejects.toThrow("unknown user");
  });

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

  test("loginUser inserts into auth", async () => {
    mockConn.execute.mockResolvedValueOnce([]);
    await DB.loginUser(1, "a.b.c");
    expect(mockConn.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO auth"),
      expect.any(Array)
    );
  });

  test("isLoggedIn returns true when found", async () => {
    mockConn.execute.mockResolvedValueOnce([[{ userId: 1 }]]);
    const result = await DB.isLoggedIn("a.b.c");
    expect(result).toBe(true);
  });

  test("logoutUser deletes from auth", async () => {
    mockConn.execute.mockResolvedValueOnce([]);
    await DB.logoutUser("a.b.c");
    expect(mockConn.execute).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM auth"),
      expect.any(Array)
    );
  });

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

  test("createFranchise throws if unknown admin", async () => {
    mockConn.execute.mockResolvedValueOnce([[]]); // no user
    await expect(
      DB.createFranchise({ name: "f", admins: [{ email: "nope" }] })
    ).rejects.toThrow("unknown user");
  });

  test("deleteFranchise rolls back on error", async () => {
    mockConn.beginTransaction.mockResolvedValue();
    mockConn.execute.mockRejectedValueOnce(new Error("fail"));
    mockConn.rollback.mockResolvedValue();
    await expect(DB.deleteFranchise(1)).rejects.toThrow(
      "unable to delete franchise"
    );
    expect(mockConn.rollback).toHaveBeenCalled();
  });

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

  test("getUserFranchises returns empty when no rows", async () => {
    mockConn.execute.mockResolvedValueOnce([[]]);
    const res = await DB.getUserFranchises(1);
    expect(res).toEqual([]);
  });

  test("createStore inserts and returns store", async () => {
    mockConn.execute.mockResolvedValueOnce([{ insertId: 77 }]);
    const store = await DB.createStore(1, { name: "SLC" });
    expect(store).toEqual({ id: 77, franchiseId: 1, name: "SLC" });
  });

  test("deleteStore deletes store", async () => {
    mockConn.execute.mockResolvedValueOnce([]);
    await DB.deleteStore(1, 2);
    expect(mockConn.execute).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM store"),
      [1, 2]
    );
  });

  test("getTokenSignature returns third part or empty", () => {
    expect(DB.getTokenSignature("a.b.c")).toBe("c");
    expect(DB.getTokenSignature("a.b")).toBe("");
  });

  test("getID returns id or throws", async () => {
    mockConn.execute.mockResolvedValueOnce([[{ id: 55 }]]);
    expect(await DB.getID(mockConn, "id", 1, "menu")).toBe(55);
    mockConn.execute.mockResolvedValueOnce([[]]);
    await expect(DB.getID(mockConn, "id", 1, "menu")).rejects.toThrow(
      "No ID found"
    );
  });

  test("initializeDatabase creates database and tables", async () => {
    mockConn.execute.mockResolvedValueOnce([[{ SCHEMA_NAME: "db" }]]);
    mockConn.query.mockResolvedValue([]);
    dbModel.tableCreateStatements = ["CREATE TABLE foo (id int)"];
    await DB.initializeDatabase();
    expect(mockConn.query).toHaveBeenCalled();
  });
});
