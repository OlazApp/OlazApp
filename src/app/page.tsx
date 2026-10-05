import { Suspense } from "react";
import { HomeBoard } from "@/components/board/HomeBoard";

export default function Home() {
  return (
    <Suspense fallback={<div className="mx-auto h-[80vh] max-w-[1320px]" />}>
      <HomeBoard />
    </Suspense>
  );
}
