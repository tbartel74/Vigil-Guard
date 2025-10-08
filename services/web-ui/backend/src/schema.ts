export type VariableMapJson = { file: string; path: string };
export type VariableMapConf = { file: string; section: string | null; key: string };

export type VariableSpec = {
  name: string;
  groupId: string;
  label: string;
  type: "string" | "number" | "boolean" | "select" | "multiline" | "secret";
  required?: boolean;
  secret?: boolean;
  pattern?: string;
  help?: string;
  map: (VariableMapJson | VariableMapConf)[];
};

export type VariableGroup = {
  id: string;
  label: string;
  description?: string;
  order?: number;
};

export type VariableSpecFile = {
  groups: VariableGroup[];
  variables: VariableSpec[];
};