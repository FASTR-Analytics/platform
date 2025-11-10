// Example of how to use the new streaming server actions

import { createAllServerActionsV2 } from "./_internal/create-all-server-actions-v2";

// Create enhanced server actions
const serverActionsV2 = createAllServerActionsV2();

// Example usage in a React component
export function ExampleStreamingUsage() {
  /*
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const handleRegularStaging = async () => {
    // Use regular route (backward compatible)
    const result = await serverActionsV2.structureStep3Dhis2_StageData({
      projectId: "123"
    });
    
    if (result.success) {
      console.log("Regular staging completed");
    } else {
      console.error("Error:", result.err);
    }
  };

  const handleStreamingStaging = async () => {
    setIsStreaming(true);
    setProgress(0);
    
    try {
      // Use streaming route (new functionality)
      const result = await serverActionsV2.structureStep3Dhis2_StageDataStreaming(
        { projectId: "123" },
        (progress, message) => {
          setProgress(progress);
          setMessage(message);
          console.log(`${Math.round(progress * 100)}%: ${message}`);
        }
      );
      
      if (result.success) {
        console.log("Streaming staging completed:", result);
      } else {
        console.error("Streaming error:", result.err);
      }
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div>
      <h2>Structure Staging Options</h2>
      
      <button onClick={handleRegularStaging}>
        Stage Data (Regular)
      </button>
      
      <button onClick={handleStreamingStaging} disabled={isStreaming}>
        {isStreaming ? "Staging..." : "Stage Data (with Progress)"}
      </button>
      
      {isStreaming && (
        <div>
          <div>Progress: {Math.round(progress * 100)}%</div>
          <div>Status: {message}</div>
          <progress value={progress} max={1} />
        </div>
      )}
    </div>
  );
  */
}

// Type-safe usage examples
export async function exampleUsages() {
  const actions = createAllServerActionsV2();

  // Regular routes are functions (backward compatible)
  await actions.getStructureItems({ projectId: "123" });
  await actions.structureStep3Dhis2_StageData({ projectId: "123" });

  // Streaming routes are also functions (but with progress callback)
  await actions.structureStep3Dhis2_StageDataStreaming(
    { projectId: "123" },
    (progress, message) => console.log(progress, message)
  );
}

export default createAllServerActionsV2;