type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  size?: "default" | "small";
  block?: boolean;
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
    variant === "secondary" ? "btnSecondary" : "",
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
