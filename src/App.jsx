import { useEffect, useState } from "react";
import Login from "./Login";
import TestKonva from "./TestKonva";

function App() {
  const [token, setToken] = useState(
    localStorage.getItem("access_token_admin")
  );

  useEffect(() => {
    const handleAuthExpired = () => {
      setToken(null);
    };

    window.addEventListener("auth-expired", handleAuthExpired);

    return () => {
      window.removeEventListener("auth-expired", handleAuthExpired);
    };
  }, []);

  if (!token) {
    return (
      <Login
        onLogin={() =>
          setToken(localStorage.getItem("access_token_admin"))
        }
      />
    );
  }

  return <TestKonva />;
}

export default App;