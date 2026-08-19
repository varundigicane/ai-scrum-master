import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signMobileToken } from "@/lib/mobile-auth";
import { toFriendlyError } from "@/lib/friendly-error";
import { getEnabledFeatures } from "@/lib/permissions";
import { FEATURE_CATALOG } from "@/lib/roles";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    const token = await signMobileToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    });

    const enabled = await getEnabledFeatures(user.companyId, user.role);
    const menus = FEATURE_CATALOG.filter((f) => f.kind === "menu" && enabled.has(f.key)).map((f) => ({
      key: f.key,
      label: f.label,
      href: f.href,
    }));

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
      },
      menus,
    });
  } catch (error) {
    return NextResponse.json({ error: toFriendlyError(error) }, { status: 500 });
  }
}
