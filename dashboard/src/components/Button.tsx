type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "small";
  block?: boolean;
};

const VARIANT_CLASS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "",
  secondary: "btnSecondary",
  ghost: "btnGhost",
  danger: "btnDanger",
};

export default function Button({
  variant = "primary",
  size = "default",
  block = false,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const classes = [
    "btn",
    VARIANT_CLASS[variant],
    size === "small" ? "btnSmall" : "",
    block ? "btnBlock" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  );
}
