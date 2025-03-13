import Link from "next/link";
export default function ButtonUI({
  children,
  type,
  theme,
  width,
  icon,
  iconPosition,
  href,
}: {
  children: React.ReactNode;
  type?: "button" | "submit" | "reset";
  theme: "primary" | "secondary" | "text";
  width?: "s" | "m" | "l";
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  href: string;
}) {
  return (
    <Link
      href={href}
      type={type}
      className={
        "flex items-center justify-center transition-colors py-2 rounded text-base font-medium " +
        (width === "s"
          ? " px-4"
          : width === "m"
            ? " px-6"
            : width === "l"
              ? " px-8"
              : " px-2") +
        (theme === "primary"
          ? " bg-blue-600 hover:bg-blue-700 text-white"
          : theme === "secondary"
            ? " bg-gray-500 hover:bg-gray-700"
            : theme === "text"
              ? " bg-transparent text-gray-600 hover:text-gray-700"
              : " border border-gray-200 hover:bg-gray-200")
      }
    >
      {icon && iconPosition === "left" && icon}
      {children}
      {icon && iconPosition === "right" && icon}
    </Link>
  );
}
