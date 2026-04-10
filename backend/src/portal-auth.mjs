// src/portal-auth.mjs
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "moxident-portal-secret-key";
const JWT_EXPIRY = "7d";
const SALT_ROUNDS = 10;

export function generateToken(email, dentistId) {
  return jwt.sign({ email, dentistId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function generateVerificationToken() {
  return randomUUID();
}

export function extractToken(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || "";
  if (auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return null;
}

export function authenticateRequest(event) {
  const token = extractToken(event);
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}
