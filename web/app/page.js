// Placeholder home page — proves the auth gate protects pages, not just API routes. The real
// upload -> manifest -> confirm -> report single-page flow replaces this in the frontend phase.
export default function Home() {
  return (
    <main>
      <h1>PM Intelligence Agent</h1>
      <p>Signed in. The upload / manifest / confirm / report flow lands here next.</p>
      <p>
        <a href="/api/health">/api/health</a> — proves gated API routes work.
      </p>
    </main>
  );
}
