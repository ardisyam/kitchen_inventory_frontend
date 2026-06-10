import Login from "./Login";
import TestKonva from "./TestKonva";

function App() {
  const token = localStorage.getItem("access_token_admin");

  if (!token) {
    return <Login />;
  }

  return <TestKonva />;
}

export default App;