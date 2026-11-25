use anchor_lang::prelude::*;

#[error_code]
pub enum ClawError {
    #[msg("Only the machine authority can do this")]
    Unauthorized,
    #[msg("The machine is paused")]
    MachinePaused,
    #[msg("The vault cannot cover the top sell-back")]
    VaultUnderfunded,
    #[msg("Slot index out of range")]
    InvalidSlotIndex,
    #[msg("Slot configuration is out of range")]
    InvalidSlotConfig,
    #[msg("Best-case expected value would reach the credit price")]
    HouseEdgeViolation,
    #[msg("Name is too long")]
    NameTooLong,
    #[msg("URI prefix is too long")]
    UriTooLong,
    #[msg("This play still holds a prize or refund to claim")]
    PlayLocked,
    #[msg("Wrong state for this instruction")]
    WrongState,
    #[msg("The steering window has closed")]
    WindowClosed,
    #[msg("The steering window is still open")]
    WindowStillOpen,
    #[msg("The randomness callback has not timed out yet")]
    CallbackNotTimedOut,
    #[msg("Only the pilot of this play can do this")]
    NotPilot,
    #[msg("Only the player or the pilot can do this")]
    NotPlayerOrPilot,
    #[msg("This play does not belong to the signer")]
    NotPlayer,
    #[msg("Validator is not on the allowed list")]
    ValidatorNotAllowed,
    #[msg("A validator account is required")]
    MissingValidator,
    #[msg("Account does not match the play")]
    InvalidPlay,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("This play has already been claimed")]
    AlreadyClaimed,
    #[msg("Nothing to claim: the claw missed")]
    NothingToClaim,
    #[msg("The prize collection has not been created")]
    NoCollection,
    #[msg("This prize has already been sold back")]
    AlreadySold,
    #[msg("The signer does not own this asset")]
    NotAssetOwner,
    #[msg("Not a valid prize asset")]
    InvalidAsset,
    #[msg("The prize collection already exists")]
    CollectionExists,
}
