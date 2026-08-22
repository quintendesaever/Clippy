export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");

  return (
    <div className="loginPage">
      <div className="loginCard">
        <h1>Clippy</h1>
        <p>Meld je aan met Discord om het rooster te bekijken.</p>
        <a href="/api/auth/discord" className="btn" style={{ display: "inline-block" }}>
          Inloggen met Discord
        </a>
        {error && (
          <p className="errorMsg" style={{ marginTop: "1rem" }}>
            {error === "invalid_callback" &&
              "Sessie verloren. Wis cookies voor deze site en probeer opnieuw."}
            {error === "token_exchange" && "Inloggen mislukt. Probeer opnieuw."}
            {error === "not_member" &&
              "Je moet lid zijn van deze Discord-server om toegang te krijgen."}
            {error !== "invalid_callback" &&
              error !== "token_exchange" &&
              error !== "not_member" &&
              "Er ging iets mis."}
          </p>
        )}
      </div>
    </div>
  );
}
