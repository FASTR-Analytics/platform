import { t3, TC } from "lib";
import {
  Button,
  ModalContainer,
  SettingsSection,
  StateHolderWrapper,
  createQuery,
  type AlertComponentProps,
} from "panther";
import { serverActions } from "~/server_actions";

export function InstanceMetaForm(p: AlertComponentProps<{}, undefined>) {
  const instanceMeta = createQuery(
    () => serverActions.getInstanceMeta({}),
    t3({
      en: "Loading instance information...",
      fr: "Chargement des informations de l'instance...",
      pt: "A carregar informações da instância...",
    }),
  );

  function formatUptime(uptimeMs: number): string {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else {
      return `${minutes}m ${seconds % 60}s`;
    }
  }

  return (
    <ModalContainer
      title={t3({
        en: "Instance Information",
        fr: "Informations de l'instance",
        pt: "Informações da instância",
      })}
      width="lg"
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button onClick={() => p.close(undefined)} iconName="x">
            {t3(TC.done)}
          </Button>,
        ]
      }
    >
      <StateHolderWrapper state={instanceMeta.state()} noPad>
        {(keyedMeta) => {
          return (
            <>
              <div class="ui-gap flex text-sm">
                <div class="flex-1">
                  <SettingsSection
                    header={t3({
                      en: "Instance Configuration",
                      fr: "Configuration de l'instance",
                      pt: "Configuração da instância",
                    })}
                  >
                    <div class="flex">
                      <div class="w-36 flex-none">
                        {t3({
                          en: "Instance Name",
                          fr: "Nom de l'instance",
                          pt: "Nome da instância",
                        })}
                        :
                      </div>
                      <div class="flex-1">{keyedMeta.instanceName}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">
                        {t3({ en: "Language", fr: "Langue", pt: "Idioma" })}:
                      </div>
                      <div class="flex-1">{keyedMeta.instanceLanguage}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">
                        {t3({
                          en: "Calendar",
                          fr: "Calendrier",
                          pt: "Calendário",
                        })}
                        :
                      </div>
                      <div class="flex-1">{keyedMeta.instanceCalendar}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">
                        {t3({
                          en: "Open Access",
                          fr: "Accès libre",
                          pt: "Acesso livre",
                        })}
                        :
                      </div>
                      <div class="flex-1">
                        <span
                          class={
                            keyedMeta.openAccess
                              ? "text-success"
                              : "text-base-content"
                          }
                        >
                          {keyedMeta.openAccess
                            ? t3({ en: "Yes", fr: "Oui", pt: "Sim" })
                            : t3({ en: "No", fr: "Non", pt: "Não" })}
                        </span>
                      </div>
                    </div>
                  </SettingsSection>
                </div>
                <div class="flex-1">
                  <SettingsSection
                    header={t3({
                      en: "Version Information",
                      fr: "Informations de version",
                      pt: "Informações de versão",
                    })}
                  >
                    <div class="flex">
                      <div class="w-36 flex-none">
                        {t3({
                          en: "Server Version",
                          fr: "Version du serveur",
                          pt: "Versão do servidor",
                        })}
                        :
                      </div>
                      <div class="flex-1">{keyedMeta.serverVersion}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">
                        {t3({
                          en: "Admin Version",
                          fr: "Version admin",
                          pt: "Versão de administração",
                        })}
                        :
                      </div>
                      <div class="flex-1">{keyedMeta.adminVersion}</div>
                    </div>
                  </SettingsSection>
                </div>
              </div>

              <div class="ui-gap flex text-sm">
                <div class="flex-1">
                  <SettingsSection
                    header={t3({
                      en: "System Status",
                      fr: "État du système",
                      pt: "Estado do sistema",
                    })}
                  >
                    <div class="flex">
                      <div class="w-36 flex-none">
                        {t3({
                          en: "Environment",
                          fr: "Environnement",
                          pt: "Ambiente",
                        })}
                        :
                      </div>
                      <div class="flex-1">{keyedMeta.environment}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">
                        {t3({
                          en: "Database Folder",
                          fr: "Dossier de base de données",
                          pt: "Pasta da base de dados",
                        })}
                        :
                      </div>
                      <div class="flex-1">{keyedMeta.databaseFolder}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">
                        {t3({
                          en: "Health Status",
                          fr: "État de santé",
                          pt: "Estado de funcionamento",
                        })}
                        :
                      </div>
                      <div class="flex-1">
                        <span
                          class={
                            keyedMeta.isHealthy ? "text-success" : "text-danger"
                          }
                        >
                          {keyedMeta.isHealthy
                            ? t3({
                                en: "Healthy",
                                fr: "Opérationnel",
                                pt: "Operacional",
                              })
                            : t3({
                                en: "Unhealthy",
                                fr: "Non opérationnel",
                                pt: "Não operacional",
                              })}
                        </span>
                      </div>
                    </div>
                  </SettingsSection>
                </div>
                <div class="flex-1">
                  <SettingsSection
                    header={t3({
                      en: "Runtime Information",
                      fr: "Informations d'exécution",
                      pt: "Informações de execução",
                    })}
                  >
                    <div class="flex">
                      <div class="w-36 flex-none">
                        {t3({
                          en: "Start Time",
                          fr: "Heure de démarrage",
                          pt: "Hora de início",
                        })}
                        :
                      </div>
                      <div class="flex-1">
                        {new Date(keyedMeta.startTime).toLocaleString()}
                      </div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">
                        {t3({
                          en: "Current Time",
                          fr: "Heure actuelle",
                          pt: "Hora atual",
                        })}
                        :
                      </div>
                      <div class="flex-1">
                        {new Date(keyedMeta.currentTime).toLocaleString()}
                      </div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">
                        {t3({
                          en: "Uptime",
                          fr: "Temps de fonctionnement",
                          pt: "Tempo de funcionamento",
                        })}
                        :
                      </div>
                      <div class="flex-1">
                        {formatUptime(keyedMeta.uptimeMs)}
                      </div>
                    </div>
                  </SettingsSection>
                </div>
              </div>
            </>
          );
        }}
      </StateHolderWrapper>
    </ModalContainer>
  );
}
