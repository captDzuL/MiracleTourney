// Last-resort 404 for locale-less paths that bypass the middleware redirect
// (e.g. static export edge cases). Root layout is a passthrough with no
// <html>/<body>, so this boundary must supply its own.
export default function NotFound() {
  return (
    <html lang="id">
      <body className="flex min-h-screen items-center justify-center bg-[#080c0e] px-4 text-white">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">404</p>
          <h1 className="text-2xl font-semibold text-white">Halaman Tidak Ditemukan</h1>
          <p className="text-sm text-slate-400">
            Halaman yang kamu cari tidak tersedia atau sudah dipindahkan.
          </p>
          <a
            href="/"
            className="mt-2 rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            Kembali ke Beranda
          </a>
        </div>
      </body>
    </html>
  );
}
