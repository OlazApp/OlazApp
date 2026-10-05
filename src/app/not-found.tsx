import Link from "next/link";
import { Mark } from "@/components/Mark";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <Mark size={72} />
      <p className="label mt-6">404</p>
      <h1 className="h-display mt-2 text-[56px]">Round not found</h1>
      <p className="mt-3 text-ink-2">That page never opened. The board is still running, though.</p>
      <Link href="/" className="btn btn-ink mt-8 h-11 px-6">
        Back to the board
      </Link>
    </main>
  );
}
