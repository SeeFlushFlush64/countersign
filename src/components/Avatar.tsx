function stringToColor(name: string) {
  const colors = ["bg-violet-500/20 text-violet-300", "bg-blue-500/20 text-blue-300", "bg-emerald-500/20 text-emerald-300", "bg-amber-500/20 text-amber-300"];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

export function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${stringToColor(name)}`}>
      {initials}
    </span>
  );
}