import { Sql } from "postgres";

export type ProjectPk = {
  // projectUser: ProjectUser;
  projectDb: Sql;
  projectId: string;
  // projectLabel: string;
};

export type StartingTaskData = {
  projectId: string;
  moduleId: string;
};

export type EndingTaskData = {
  projectId: string;
  moduleId: string;
  successOrError: "success" | "error";
};
