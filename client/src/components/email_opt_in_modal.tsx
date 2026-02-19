import { clerk } from "~/components/LoggedInWrapper";
import { Button, ModalContainer, type AlertComponentProps } from "panther";
import { createSignal } from "solid-js";

export function EmailOptInModal(p: AlertComponentProps<void, undefined>) {
    const [loading, setLoading] = createSignal(false);

    async function handleChoice(optIn: boolean) {
        setLoading(true);
        try {
            await clerk.user?.update({
                unsafeMetadata: {
                    ...clerk.user.unsafeMetadata,
                    emailOptIn: optIn,
                    emailOptInAsked: true,
                },
            });
        } finally {
            setLoading(false);
        }
        p.close(undefined);
    }

    return (
        <ModalContainer
            width="sm"
            topPanel={<div class="font-700 text-base-content text-xl">Stay in the loop</div>}
            leftButtons={
                // eslint-disable-next-line jsx-key
                [
                <Button onClick={() => handleChoice(false)} intent="neutral" disabled={loading()}>
                No thanks
                </Button>,
            ]}
            rightButtons={
                // eslint-disable-next-line jsx-key
                [
                <Button onClick={() => handleChoice(true)} intent="primary" disabled={loading()}>
                Yes, sign me up
                </Button>,
            ]}
        >
            <p class="text-base-content text-sm">
                Would you like to receive email updates and announcements?
            </p>
        </ModalContainer>
    );
}