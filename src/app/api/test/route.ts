import { NextResponse } from "next/server";

export async function GET() {

  return NextResponse.json({
    message: "API works",
    database: process.env.DATABASE_URL ? "OK" : "NOT FOUND",
  });
}