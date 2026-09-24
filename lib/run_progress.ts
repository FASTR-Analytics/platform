import { getModuleFamilyLabel } from "./group_metrics.ts";
import { t3 } from "./translate/mod.ts";
import { MODULE_REGISTRY, type RunProgress } from "./types/mod.ts";

// The generation fraction, derived from the stage alone so it is monotonic
// whatever the reuse plan pre-marks: prepare is one step, resolve plus plan
// is one, each module is one, finalize is one (SYSTEM_08 "The stage").
export function runProgressSteps(progress: RunProgress): {
  done: number;
  total: number;
} {
  const total = progress.moduleOrder.length + 3;
  const stage = progress.stage;
  switch (stage.kind) {
    case "queued":
    case "exporting":
    case "converting":
      return { done: 0, total };
    case "resolving":
    case "planning":
      return { done: 1, total };
    case "module":
      return {
        done: 2 + Math.max(0, progress.moduleOrder.indexOf(stage.moduleId)),
        total,
      };
    case "finalizing":
    case "publishing":
      return { done: 2 + progress.moduleOrder.length, total };
    case "ended":
      return { done: total, total };
  }
}

// The stage sentence shown beside the bar and above a failed run's error.
export function runStageLabel(progress: RunProgress): string {
  const stage = progress.stage;
  switch (stage.kind) {
    case "queued":
      return t3({ en: "Starting", fr: "Démarrage", pt: "A iniciar" });
    case "exporting": {
      const family = getModuleFamilyLabel(stage.family);
      return t3({
        en: `Exporting ${family} data`,
        fr: `Exportation des données ${family}`,
        pt: `A exportar dados ${family}`,
      });
    }
    case "converting": {
      const family = getModuleFamilyLabel(stage.family);
      return t3({
        en: `Converting ${family} data to parquet`,
        fr: `Conversion des données ${family} en parquet`,
        pt: `A converter dados ${family} para parquet`,
      });
    }
    case "resolving":
      return t3({
        en: "Resolving module definitions",
        fr: "Résolution des définitions de modules",
        pt: "A resolver definições de módulos",
      });
    case "planning":
      return t3({
        en: "Checking earlier packages for reusable outputs",
        fr: "Recherche de résultats réutilisables dans les paquets précédents",
        pt: "A verificar pacotes anteriores por resultados reutilizáveis",
      });
    case "module": {
      const module = moduleLabel(stage.moduleId);
      return progress.moduleStatus[stage.moduleId] === "reused"
        ? t3({
          en: `Reusing outputs for ${module}`,
          fr: `Réutilisation des résultats de ${module}`,
          pt: `A reutilizar resultados de ${module}`,
        })
        : t3({
          en: `Running ${module}`,
          fr: `Exécution de ${module}`,
          pt: `A executar ${module}`,
        });
    }
    case "finalizing": {
      if (stage.moduleId === null) {
        return t3({
          en: "Building the package",
          fr: "Construction du paquet",
          pt: "A construir o pacote",
        });
      }
      const module = moduleLabel(stage.moduleId);
      return t3({
        en: `Building parquet for ${module}`,
        fr: `Construction du parquet de ${module}`,
        pt: `A construir parquet para ${module}`,
      });
    }
    case "publishing":
      return t3({ en: "Publishing", fr: "Publication", pt: "A publicar" });
    case "ended":
      return t3({ en: "Complete", fr: "Terminé", pt: "Concluído" });
  }
}

function moduleLabel(moduleId: string): string {
  const entry = MODULE_REGISTRY.find((m) => m.id === moduleId);
  return entry === undefined ? moduleId : t3(entry.label);
}
