import { FastestTable, type FastestEver } from "@/components/fastest-table";
import { MethodologyNote } from "@/components/methodology-note";
import { SITE } from "@/site.config";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL || "http://localhost:8092";

async function getFastest(): Promise<FastestEver[]> {
  try {
    const res = await fetch(`${API_URL}/api/fastest?limit=100`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function PlusRapidesPage() {
  const fastest = await getFastest();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Les vitesses record
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Classement de tous les bateaux par leur vitesse maximale jamais
          enregistrée sur la {SITE.river} à {SITE.city}.
        </p>
      </div>

      <MethodologyNote />

      <FastestTable data={fastest} />
    </main>
  );
}
