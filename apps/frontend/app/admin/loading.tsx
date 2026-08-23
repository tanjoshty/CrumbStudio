export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-8 animate-pulse">
      <div className="h-9 w-48 bg-cream-border/60" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 border border-cream-border bg-paper" />
        ))}
      </div>
    </div>
  )
}
