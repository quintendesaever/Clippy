import clippyLogo from "../assets/logoicon_clippy_01@2x.png";

export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");

  return (
    <div className="loginPage">
      <div className="loginCard">
        <div className="loginBrand">
          <img src={clippyLogo} alt="" width={32} height={32} />
          <h1>Clippy</h1>
        </div>
        <p>Meld je aan met Discord om het rooster te bekijken.</p>
        <a href="/api/auth/discord" className="btn">
          Inloggen met Discord
        </a>
        {error && (
          <p className="errorMsg">
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
