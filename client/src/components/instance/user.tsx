import {
  H_USERS,
  OtherUser,
  t3,
  TC,
  UserPermission,
  USER_PERMISSIONS,
  INSTANCE_PERMISSION_LABELS,
} from "lib";
import {
  Button,
  Checkbox,
  FrameTop,
  HeadingBar,
  Card,
  openComponent,
  createButtonAction,
  createDeleteAction,
} from "panther";
import { For, Match, Show, Switch, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  user: OtherUser;
  thisLoggedInUserEmail: string;
  close: () => void;
};

function makeDefaultUserPermissions(): Record<UserPermission, boolean> {
  return Object.fromEntries(USER_PERMISSIONS.map((k) => [k, false])) as Record<
    UserPermission,
    boolean
  >;
}

export function User(p: Props) {
  const currentUserIsHUser = () => H_USERS.includes(p.thisLoggedInUserEmail);

  const [permissions, setPermissions] = createSignal<Record<
    UserPermission,
    boolean
  > | null>(null);
  const [originalPermissions, setOriginalPermissions] = createSignal<Record<
    UserPermission,
    boolean
  > | null>(null);

  const [unlimitedAi, setUnlimitedAi] = createSignal(p.user.unlimitedAi);
  const toggleUnlimitedAi = createButtonAction(
    () =>
      serverActions.setUserUnlimitedAi({
        email: p.user.email,
        unlimited: !unlimitedAi(),
      }),
    () => {
      setUnlimitedAi((v) => !v);
    },
  );

  const [isContactPerson, setIsContactPerson] = createSignal(
    p.user.isContactPerson,
  );
  const toggleContactPerson = createButtonAction(
    () =>
      serverActions.setUserContactPerson({
        email: p.user.email,
        isContactPerson: !isContactPerson(),
      }),
    () => {
      setIsContactPerson((v) => !v);
    },
  );

  // get user permissions
  (async () => {
    const res = await serverActions.getUserPermissions({ email: p.user.email });
    if (res.success) {
      setPermissions(res.data.permissions);
      setOriginalPermissions(res.data.permissions);
    } else {
      setPermissions(makeDefaultUserPermissions());
      setOriginalPermissions(makeDefaultUserPermissions());
    }
  })();

  const hasChanges = () => {
    const current = permissions();
    const original = originalPermissions();
    if (!current || !original) return false;
    return USER_PERMISSIONS.some((key) => current[key] !== original[key]);
  };

  const togglePermission = async (key: UserPermission) => {
    const current = permissions();
    if (!current) return;
    setPermissions({ ...current, [key]: !current[key] });
  };

  const savePermissions = createButtonAction(
    () => {
      const perms = permissions();
      if (!perms)
        return Promise.resolve({ success: false, err: "No permissions" });
      return serverActions.updateUserPermissions({
        email: p.user.email,
        permissions: perms,
      });
    },
    () => {
      setOriginalPermissions(permissions());
    },
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
      panelChildren={
        <HeadingBar
          tonal
          onBack={p.close}
          heading={`${t3({ en: "User profile for", fr: "Profil utilisateur de", pt: "Perfil de utilizador de" })} ${p.user.email}`}
        />
      }
    >
      <div class="ui-pad ui-spy">
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
        <Show
          when={
            instanceState.currentUserIsGlobalAdmin ||
            instanceState.currentUserPermissions.can_configure_users
          }
        >
          <Card
            header={t3({
              en: "Instance permissions",
              fr: "Droits d'accès à l'instance",
              pt: "Permissões da instância",
            })}
            headerRight={
              <div class="ui-gap-sm flex">
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
              </div>
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
                      en: "Save Changes",
                      fr: "Sauvegarder les modifications",
                      pt: "Guardar alterações",
                    })}
                  </Button>
                </Show>
              }
            >
              <div class="ui-spy-sm">
                <Show
                  when={permissions()}
                  fallback={<div>{t3(TC.loading)}</div>}
                >
                  {(perms) => (
                    <div class="space-y-2">
                      <For each={USER_PERMISSIONS as readonly UserPermission[]}>
                        {(key) => (
                          <Checkbox
                            label={t3(INSTANCE_PERMISSION_LABELS[key])}
                            checked={perms()[key]}
                            onChange={() => togglePermission(key)}
                          />
                        )}
                      </For>
                    </div>
                  )}
                </Show>
              </div>
            </Card>
          </Show>
          <Show when={currentUserIsHUser()}>
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
                  checked={unlimitedAi()}
                  onChange={toggleUnlimitedAi.click}
                />
              </div>
            </Card>
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
                  checked={isContactPerson()}
                  onChange={toggleContactPerson.click}
                />
              </div>
            </Card>
          </Show>
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
      </div>
    </FrameTop>
  );
}
