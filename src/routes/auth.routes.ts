import { Hono } from "hono";
import {
  authenticateUser,
  getTokensForUser,
  registerUser,
} from "../services/auth";
import { findUserByEmail, getAllUsers } from "../db/sqlite";

export const authRouter = new Hono();

authRouter.post("/signup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, name, password, password2, tc } = body;

  if (!email || !password || !name) {
    return c.json(
      {
        errors: {
          ...(!email ? { email: ["This field is required."] } : {}),
          ...(!name ? { name: ["This field is required."] } : {}),
          ...(!password ? { password: ["This field is required."] } : {}),
        },
      },
      400
    );
  }

  if (password !== password2) {
    return c.json(
      {
        errors: {
          non_field_errors: ["password not same"],
        },
      },
      400
    );
  }

  const existing = findUserByEmail(email);
  if (existing) {
    return c.json(
      {
        errors: {
          email: ["user with this Email already exists."],
        },
      },
      400
    );
  }

  try {
    const user = await registerUser({
      email,
      name,
      password,
      password2,
      tc: tc || "True",
    });

    const token = await getTokensForUser(user);
    return c.json(
      {
        token,
        message: "success",
      },
      201
    );
  } catch (err: any) {
    return c.json(
      {
        errors: {
          non_field_errors: [err?.message || "Registration failed"],
        },
      },
      400
    );
  }
});

authRouter.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body;

  if (!email || !password) {
    return c.json(
      {
        errors: {
          ...(!email ? { email: ["This field is required."] } : {}),
          ...(!password ? { password: ["This field is required."] } : {}),
        },
      },
      400
    );
  }

  const user = await authenticateUser(email, password);

  if (!user) {
    return c.json(
      {
        errors: {
          non_field_errors: ["Email or Password not valid"],
        },
      },
      404
    );
  }

  const token = await getTokensForUser(user);
  const allUsers = getAllUsers();

  return c.json(
    {
      token,
      user: {
        id: user.id,
        username: user.email,
        email: user.email,
        name: user.name,
      },
      users: allUsers,
      msg: "login success",
    },
    200
  );
});
