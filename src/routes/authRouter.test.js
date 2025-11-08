//built in helper from supertest that wraps an express application and lets me make fake HTTP requests
const request = require("supertest");
//refers to my Express app, found in service
const app = require("../service");

//make a test user to practice logging in and registering
const testUser = { name: "pizza diner", email: "reg@test.com", password: "a" };
let testUserAuthToken;

beforeAll(async () => {
  //make a random email before each test, I think to be able to register a new user each time
  testUser.email = Math.random().toString(36).substring(2, 12) + "@test.com";
  //register the new user so they're in the system
  const registerRes = await request(app).post("/api/auth").send(testUser);
  //store authToken from registerResponse
  testUserAuthToken = registerRes.body.token;
  //make sure the authToken matches the correct regex pattern
  expectValidJwt(testUserAuthToken);
});

/*test("login", async () => {
  //send a request to the api to login, .send tells supertest what the request body needs to be
  const loginRes = await request(app).put("/api/auth").send(testUser);
  //should be successful, because I registered this testUser before beginning
  expect(loginRes.status).toBe(200);
  //should be valid token, because login successful
  expectValidJwt(loginRes.body.token);

  //default role is diner, because it was set as diner upon registering
  const expectedUser = { ...testUser, roles: [{ role: "diner" }] };
  //expected user should be the same as the user logged in (minus password)
  delete expectedUser.password;
  expect(loginRes.body.user).toMatchObject(expectedUser);
});*/

//Check authToken syntax
function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/
  );
}

//function to create randomnames for objects I create for tests
/*function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

//code to create an admin user for testing to do admin things like create franchises
const { Role, DB } = require('../database/database.js');

async function createAdminUser() {
  let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
  user.name = randomName();
  user.email = user.name + '@admin.com';

  user = await DB.addUser(user);
  return { ...user, password: 'toomanysecrets' };
}

//code to increase timeout for jest when debugging
if (process.env.VSCODE_INSPECTOR_OPTIONS) {
  jest.setTimeout(60 * 1000 * 5); // 5 minutes
}*/
