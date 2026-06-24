export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");

  return (
    <div className="loginPage">
      <div className="loginCard">
        <h1>Clippy Settings</h1>
        <p>Sign in with Discord to manage your server settings.</p>
        <a href="/api/auth/discord" className="btn" style={{ display: "inline-block" }}>
          Login with Discord
        </a>
        {error && (
          <p className="errorMsg" style={{ marginTop: "1rem" }}>
            {error === "invalid_callback" &&
              "Session was lost. Clear cookies for this site and try again."}
            {error === "token_exchange" && "Could not complete login. Please try again."}
            {error === "not_member" && "You must be a member of this Discord server to access settings."}
            {error !== "invalid_callback" &&
              error !== "token_exchange" &&
              error !== "not_member" &&
              "Something went wrong."}
          </p>
        )}
      </div>
    </div>
  );
}
