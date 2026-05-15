import { Profiler, type ReactNode } from "react";
import { reportProfilerSample } from "./index";

type PerfProfilerProps = {
  id: string;
  children: ReactNode;
};

export function PerfProfiler({ id, children }: PerfProfilerProps) {
  return (
    <Profiler
      id={id}
      onRender={(
        profilerId,
        phase,
        actualDuration,
        baseDuration,
        startTime,
        commitTime,
      ) => {
        reportProfilerSample({
          id: profilerId,
          phase,
          actualDuration,
          baseDuration,
          startTime,
          commitTime,
        });
      }}
    >
      {children}
    </Profiler>
  );
}
