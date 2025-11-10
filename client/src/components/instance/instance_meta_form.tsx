import { InstanceMeta, t, t2, T } from "lib";
import {
  Button,
  SettingsSection,
  StateHolderWrapper,
  timQuery,
  type AlertComponentProps,
} from "panther";
import { serverActions } from "~/server_actions";

export function InstanceMetaForm(
  p: AlertComponentProps<{}, undefined>,
) {
  const instanceMeta = timQuery(
    () => serverActions.getInstanceMeta({}),
    t("Loading instance information..."),
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
    <div class="w-[800px]">
      <StateHolderWrapper state={instanceMeta.state()}>
        {(keyedMeta) => {
          return (
            <div class="ui-pad ui-spy">
              <div class="font-700 text-base-content text-xl">
                {t("Instance Information")}
              </div>
              <div class="ui-gap flex text-sm">
                <div class="flex-1">
                  <SettingsSection header={t("Instance Configuration")}>
                    <div class="flex">
                      <div class="w-36 flex-none">{t("Instance Name")}:</div>
                      <div class="flex-1">{keyedMeta.instanceName}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">{t("Redirect URL")}:</div>
                      <div class="flex-1">{keyedMeta.instanceRedirectUrl}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">{t("Language")}:</div>
                      <div class="flex-1">{keyedMeta.instanceLanguage}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">{t("Calendar")}:</div>
                      <div class="flex-1">{keyedMeta.instanceCalendar}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">{t("Open Access")}:</div>
                      <div class="flex-1">
                        <span class={keyedMeta.openAccess ? "text-success" : "text-base-content"}>
                          {keyedMeta.openAccess ? t2(T.FRENCH_UI_STRINGS.yes) : t2(T.FRENCH_UI_STRINGS.no)}
                        </span>
                      </div>
                    </div>
                  </SettingsSection>
                </div>
                <div class="flex-1">
                  <SettingsSection header={t("Version Information")}>
                    <div class="flex">
                      <div class="w-36 flex-none">{t("Server Version")}:</div>
                      <div class="flex-1">{keyedMeta.serverVersion}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">{t("Admin Version")}:</div>
                      <div class="flex-1">{keyedMeta.adminVersion}</div>
                    </div>
                  </SettingsSection>
                </div>
              </div>

              <div class="ui-gap flex text-sm">
                <div class="flex-1">
                  <SettingsSection header={t("System Status")}>
                    <div class="flex">
                      <div class="w-36 flex-none">{t("Environment")}:</div>
                      <div class="flex-1">{keyedMeta.environment}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">{t("Database Folder")}:</div>
                      <div class="flex-1">{keyedMeta.databaseFolder}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">{t("Health Status")}:</div>
                      <div class="flex-1">
                        <span class={keyedMeta.isHealthy ? "text-success" : "text-danger"}>
                          {keyedMeta.isHealthy ? t("Healthy") : t("Unhealthy")}
                        </span>
                      </div>
                    </div>
                  </SettingsSection>
                </div>
                <div class="flex-1">
                  <SettingsSection header={t("Runtime Information")}>
                    <div class="flex">
                      <div class="w-36 flex-none">{t("Start Time")}:</div>
                      <div class="flex-1">{new Date(keyedMeta.startTime).toLocaleString()}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">{t("Current Time")}:</div>
                      <div class="flex-1">{new Date(keyedMeta.currentTime).toLocaleString()}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">{t("Uptime")}:</div>
                      <div class="flex-1">{formatUptime(keyedMeta.uptimeMs)}</div>
                    </div>
                  </SettingsSection>
                </div>
              </div>

              <div class="ui-gap-sm flex">
                <Button onClick={() => p.close(undefined)} iconName="x">
                  Done
                </Button>
              </div>
            </div>
          );
        }}
      </StateHolderWrapper>
    </div>
  );
}