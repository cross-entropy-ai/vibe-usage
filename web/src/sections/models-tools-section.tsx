import { useModelsTools } from "@/lib/contexts";
import { DurationChart } from "@/components/duration-chart";
import { ModelsChart } from "@/components/models-chart";
import { ToolCallsChart } from "@/components/tool-calls-chart";
import { ToolStatusChart } from "@/components/tool-status-chart";
import { Toolchains } from "@/components/toolchains";
import { ModelSwitches } from "@/components/model-switches";

export function ModelsToolsSection() {
  const modelsTools = useModelsTools();

  return (
    <>
      {(modelsTools?.duration || modelsTools?.models) && (
        <div className="grid gap-4 md:grid-cols-2">
          {modelsTools?.duration && <DurationChart data={modelsTools.duration} />}
          {modelsTools?.models && <ModelsChart data={modelsTools.models} />}
        </div>
      )}
      {(modelsTools?.toolCalls || modelsTools?.toolStatus) && (
        <div className="grid gap-4 md:grid-cols-2">
          {modelsTools?.toolCalls && <ToolCallsChart data={modelsTools.toolCalls} />}
          {modelsTools?.toolStatus && <ToolStatusChart data={modelsTools.toolStatus} />}
        </div>
      )}
      {modelsTools?.toolchains && <Toolchains data={modelsTools.toolchains} />}
      {modelsTools?.modelSwitches && <ModelSwitches data={modelsTools.modelSwitches} />}
    </>
  );
}
