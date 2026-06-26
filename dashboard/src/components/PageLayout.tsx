type PageLayoutProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export default function PageLayout({ title, subtitle, actions, children }: PageLayoutProps) {
  return (
    <div className="pageLayout">
      <header className="topBar">
        <div className="topBarHeading">
          <h1 className="topBarTitle">{title}</h1>
          {subtitle && <p className="topBarSubtitle">{subtitle}</p>}
        </div>
        {actions && <div className="topBarActions">{actions}</div>}
      </header>
      <div className="pageLayoutContent">{children}</div>
    </div>
  );
}
