import { type ProjectDetail } from "lib";

type Props = {
  projectDetail: ProjectDetail;
};

export function ProjectAiReport(p: Props) {
  const projectId = p.projectDetail.id;

  return (
    <div class="ui-pad w-full h-full">Hi this is the project AI report</div>
  );
}