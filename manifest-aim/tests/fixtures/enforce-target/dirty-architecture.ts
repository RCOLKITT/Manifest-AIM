// This file intentionally violates clean architecture.
// Domain service directly importing infrastructure.

import { PrismaClient } from "@prisma/client";
import express from "express";

const prisma = new PrismaClient();
const app = express();

// Business logic mixed with route handler — no separation
app.post("/orders", async (req, res) => {
  const { userId, items } = req.body;

  // No input validation before business logic
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const total = items.reduce((sum: number, item: { price: number; qty: number }) => {
    return sum + item.price * item.qty;
  }, 0);

  const order = await prisma.order.create({
    data: { userId, total, items: JSON.stringify(items) },
  });

  return res.json(order);
});

export { app };
