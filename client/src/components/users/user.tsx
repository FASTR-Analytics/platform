import {
  INSTANCE_PERMISSION_LABELS,
  OtherUser,
  pickUserPermissions,
  t3,
  TC,
  USER_PERMISSIONS,
  UserPermission,
  type UserPermissions,
} from "lib";
import {
  Button,
  Card,
  Checkbox,
  createButtonAction,
  createDeleteAction,
  FrameTop,
  HeadingBar,
} from "panther";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Switch,
} from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import {
  copilotViewController,
  holdCopilotView,
} from "~/components/instance/copilot/mod.ts";
import { UserScopesCard } from "./user_scopes";
import { can, canCallRoute, isGlobalAdmin } from "~/state/instance/permissions";

type Props = {
  email: string;
  close: (v: undefined) => void;
};

// The row is read live from T1 rather than snapshotted through the wrapper,
// so an admin toggle or a permission change shows without a remount, and the
// page closes itself when the row is removed. The page sets the chat's `user`
// view (S13), whose label names the page and never the email.
export function User(p: Props) {
  holdCopilotView();
  copilotViewController.setView("user");
  const user = createMemo(() =>
    instanceState.users.find((u) => u.email === p.email)
  );
  createEffect(() => {
    const row = user();
    if (row === undefined) p.close(undefined);
  });
  return (
    <Show when={user()}>
      {(user) => <UserDetail user={user()} close={() => p.close(undefined)} />}
    </Show>
  );
}

type DetailProps = {
  user: OtherUser;
  close: () => void;
};

function UserDetail(p: DetailProps) {
  // The toggled keys, held as a patch over the live roster row (its stored
  // bits), so a roster update under the open page shows through and Save
  // writes the row with the patch applied, never an all-false default.
  const [patch, setPatch] = createSignal<
    Partial<Record<UserPermission, boolean>>
  >({});
  const stored = () => pickUserPermissions(p.user);
  const bits = (): UserPermissions => ({ ...stored(), ...patch() });
  const hasChanges = () =>
    USER_PERMISSIONS.some((key) => bits()[key] !== stored()[key]);
  const togglePermission = (key: UserPermission) =>
    setPatch((current) => {
      const next: Partial<Record<UserPermission, boolean>> = { ...current };
      next[key] = !bits()[key];
      return next;
    });
  const savePermissions = createButtonAction(
    () =>
      serverActions.updateUserPermissions({
        email: p.user.email,
        permissions: bits(),
      }),
    () => {
      setPatch({});
    },
  );

  // Both toggles read the live row; the roster broadcast carries the change.
  const toggleUnlimitedAi = createButtonAction(
    () =>
      serverActions.setUserUnlimitedAi({
        email: p.user.email,
        unlimited: !p.user.unlimitedAi,
      }),
    async () => {},
  );
  const toggleContactPerson = createButtonAction(
    () =>
      serverActions.setUserContactPerson({
        email: p.user.email,
        isContactPerson: !p.user.isContactPerson,
      }),
    async () => {},
  );

  const attemptMakeAdmin = createButtonAction(
    () =>
      serverActions.toggleUserAdmin({
        emails: [p.user.email],
        makeAdmin: true,
      }),
    async () => {},
  );
  const attemptMakeNonAdmin = createButtonAction(
    () =>
      serverActions.toggleUserAdmin({
        emails: [p.user.email],
        makeAdmin: false,
      }),
    async () => {},
  );

  async function attemptDeleteUser() {
    const deleteAction = createDeleteAction(
      {
        text: t3({
          en: "Are you sure you want to remove this user?",
          fr: "Êtes-vous sûr de vouloir supprimer cet utilisateur ?",
          pt: "Tem a certeza de que pretende remover este utilizador?",
        }),
        itemList: [p.user.email],
      },
      () => serverActions.deleteUser({ emails: [p.user.email] }),
      async () => {},
      () => p.close(),
    );

    await deleteAction.click();
  }

  return (
    <FrameTop
      pad="md"
      spy="md"
      panelChildren={
        <HeadingBar
          tonal
          onBack={p.close}
          heading={`${
            t3({
              en: "User profile for",
              fr: "Profil utilisateur de",
              pt: "Perfil de utilizador de",
            })
          } ${p.user.email}`}
        />
      }
    >
      <Card
        header={t3({
          en: "Login details",
          fr: "Identifiants",
          pt: "Dados de início de sessão",
        })}
      >
        <div class="ui-spy-sm">
          <div class="flex">
            <div class="w-48 flex-none">{t3(TC.email)}:</div>
            <div class="flex-1">{p.user.email}</div>
          </div>
        </div>
      </Card>
      <Show when={can("can_configure_users")}>
        <Card
          header={t3({
            en: "Instance permissions",
            fr: "Droits d'accès à l'instance",
            pt: "Permissões da instância",
          })}
          headerRight={
            <Show when={canCallRoute("toggleUserAdmin")}>
              <Switch>
                <Match when={p.user.isGlobalAdmin}>
                  <Button
                    onClick={attemptMakeNonAdmin.click}
                    state={attemptMakeNonAdmin.state()}
                    outline
                  >
                    {t3({
                      en: "Make non-admin",
                      fr: "Retirer le rôle d'administrateur",
                      pt: "Remover administrador",
                    })}
                  </Button>
                </Match>
                <Match when={true}>
                  <Button
                    onClick={attemptMakeAdmin.click}
                    state={attemptMakeAdmin.state()}
                    outline
                  >
                    {t3({
                      en: "Make admin",
                      fr: "Attribuer le rôle d'administrateur",
                      pt: "Tornar administrador",
                    })}
                  </Button>
                </Match>
              </Switch>
            </Show>
          }
        >
          <div class="ui-spy-sm">
            <div class="flex">
              <div class="w-48 flex-none">
                {t3({
                  en: "Instance admin",
                  fr: "Administrateur de l'instance",
                  pt: "Administrador da instância",
                })}
                :
              </div>
              <div class="flex-1">
                {p.user.isGlobalAdmin
                  ? t3({ en: "Yes", fr: "Oui", pt: "Sim" })
                  : t3({ en: "No", fr: "Non", pt: "Não" })}
              </div>
            </div>
          </div>
        </Card>
        <Show when={p.user.isGlobalAdmin === false}>
          <Card
            header={t3({
              en: "User Permissions",
              fr: "Droits d'accès de l'utilisateur",
              pt: "Permissões do utilizador",
            })}
            headerRight={
              <Show when={hasChanges()}>
                <Button
                  onClick={savePermissions.click}
                  state={savePermissions.state()}
                >
                  {t3({
                    en: "Save changes",
                    fr: "Sauvegarder les modifications",
                    pt: "Guardar alterações",
                  })}
                </Button>
              </Show>
            }
          >
            <div class="ui-spy-sm">
              <div class="space-y-2">
                <For each={USER_PERMISSIONS as readonly UserPermission[]}>
                  {(key) => (
                    <Checkbox
                      label={t3(INSTANCE_PERMISSION_LABELS[key])}
                      checked={bits()[key]}
                      onChange={() => togglePermission(key)}
                    />
                  )}
                </For>
              </div>
            </div>
          </Card>
        </Show>
        <Show when={isGlobalAdmin() && !p.user.isGlobalAdmin}>
          <UserScopesCard user={p.user} />
        </Show>
        <Show when={canCallRoute("setUserUnlimitedAi")}>
          <Card
            header={t3({
              en: "AI usage",
              fr: "Utilisation IA",
              pt: "Utilização de IA",
            })}
          >
            <div class="ui-spy-sm">
              <Checkbox
                label={t3({
                  en: "Unlimited AI token usage",
                  fr: "Utilisation IA illimitée",
                  pt: "Utilização ilimitada de tokens de IA",
                })}
                checked={p.user.unlimitedAi}
                onChange={toggleUnlimitedAi.click}
              />
            </div>
          </Card>
        </Show>
        <Show when={canCallRoute("setUserContactPerson")}>
          <Card
            header={t3({
              en: "Contact person",
              fr: "Personne de contact",
              pt: "Pessoa de contacto",
            })}
          >
            <div class="ui-spy-sm">
              <Checkbox
                label={t3({
                  en: "Contact person",
                  fr: "Personne de contact",
                  pt: "Pessoa de contacto",
                })}
                checked={p.user.isContactPerson}
                onChange={toggleContactPerson.click}
              />
            </div>
          </Card>
        </Show>
        <Show when={canCallRoute("deleteUser")}>
          <Button
            onClick={attemptDeleteUser}
            intent="danger"
            outline
            iconName="trash"
          >
            {t3({
              en: "Remove this user",
              fr: "Supprimer cet utilisateur",
              pt: "Remover este utilizador",
            })}
          </Button>
        </Show>
      </Show>
    </FrameTop>
  );
}
