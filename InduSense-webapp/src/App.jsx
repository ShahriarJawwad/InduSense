import { db } from "./firebase";
import { ref, set } from "firebase/database";

function App() {
  const testWrite = () => {
    set(ref(db, 'test'), {
      message: "Firebase connected"
    });
  };

  return (
    <div>
      <h1>InduSense Dashboard</h1>
      <button onClick={testWrite}>Test Firebase</button>
    </div>
  );
}

export default App;
