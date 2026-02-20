import { NextResponse } from "next/server";

export async function GET() {
  console.log("DATABASE_URL:", process.env.DATABASE_URL);

  return NextResponse.json({
    message: "API works",
    database: process.env.DATABASE_URL ? "OK" : "NOT FOUND",
  });
}