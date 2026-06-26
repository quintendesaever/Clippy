type PagePanelProps = {
  children: React.ReactNode;
  className?: string;
};

export default function PagePanel({ children, className = "" }: PagePanelProps) {
  return <section className={`pagePanel ${className}`.trim()}>{children}</section>;
}
