import clippyLogo from "../assets/logoicon_clippy_01@2x.png";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_callback: "Sessie verloren. Wis cookies voor deze site en probeer opnieuw.",
  token_exchange: "Inloggen mislukt. Probeer opnieuw.",
  not_member: "Je moet lid zijn van deze Discord-server om toegang te krijgen.",
};

function DiscordMark() {
  return (
    <svg className="loginDiscordIcon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M16.5 4.2c-1.3-.6-2.7-1-4.2-1.2-.2.3-.4.7-.5 1-1.5-.2-3.1-.2-4.6 0-.2-.3-.4-.7-.6-1-1.5.2-2.9.6-4.2 1.2C.8 7.5.3 10.7.5 13.8c1.7 1.3 3.4 2 5 2.4.4-.6.8-1.2 1.1-1.8-.6-.2-1.2-.5-1.7-.8.1-.1.3-.2.4-.3 3.4 1.6 7.1 1.6 10.4 0 .2.1.3.2.4.3-.6.3-1.1.6-1.7.8.3.6.7 1.2 1.1 1.8 1.7-.4 3.3-1.1 5-2.4.3-3.6-.5-6.8-2-9.6ZM6.9 12.3c-1 0-1.9-.9-1.9-2s.8-2 1.9-2 1.9 1 1.9 2-.8 2-1.9 2Zm6.2 0c-1 0-1.9-.9-1.9-2s.8-2 1.9-2 1.9 1 1.9 2-.9 2-1.9 2Z" />
    </svg>
  );
}

export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "Er ging iets mis.") : null;

  return (
    <div className="loginPage">
      <div className="loginCard">
        <div className="loginBrand">
          <span className="loginLogo">
            <img src={clippyLogo} alt="" width={36} height={36} />
          </span>
          <div>
            <h1 className="loginTitle">Clippy</h1>
            <p className="loginEyebrow">Dashboard</p>
          </div>
        </div>
        <p className="loginLead">
          Meld je aan met Discord om het rooster van de server te bekijken en je eigen
          activiteiten te beheren.
        </p>
        <a href="/api/auth/discord" className="btn loginBtn">
          <DiscordMark />
          Inloggen met Discord
        </a>
        {errorMessage && (
          <p className="errorMsg" role="alert">
            {errorMessage}
          </p>
        )}
        <p className="loginFooter">Alleen leden van de Discord-server krijgen toegang.</p>
      </div>
    </div>
  );
}
