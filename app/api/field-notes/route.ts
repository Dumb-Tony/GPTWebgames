import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { fieldNotes } from "../../../db/schema";

const categories = new Set(["visual", "controls", "gameplay", "bug", "idea"]);

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return "The shared notes database is still being prepared. Try again in a moment.";
  }
  return "Shared notes are temporarily unavailable.";
}

export async function GET() {
  try {
    const db = getDb();
    const notes = await db
      .select()
      .from(fieldNotes)
      .orderBy(desc(fieldNotes.createdAt), desc(fieldNotes.id))
      .limit(60);

    return Response.json(
      { notes },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      author?: string;
      category?: string;
      content?: string;
    };
    const author = payload.author?.trim().slice(0, 40) ?? "";
    const content = payload.content?.trim().slice(0, 700) ?? "";
    const category = categories.has(payload.category ?? "")
      ? (payload.category as string)
      : "idea";

    if (!author) {
      return Response.json({ error: "Add your name or initials." }, { status: 400 });
    }
    if (content.length < 3) {
      return Response.json({ error: "Write at least three characters." }, { status: 400 });
    }

    const db = getDb();
    const [note] = await db
      .insert(fieldNotes)
      .values({
        author,
        category,
        content,
      build: "017",
      })
      .returning();

    return Response.json({ note }, { status: 201 });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
