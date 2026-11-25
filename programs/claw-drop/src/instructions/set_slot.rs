use anchor_lang::prelude::*;

use crate::errors::ClawError;
use crate::state::*;
use crate::AdminMachine;

/// Configure one slot. Games already in flight keep the odds they started with (each `Play`
/// carries its own snapshot); `minted` is never touched here.
pub fn handler(ctx: Context<AdminMachine>, index: u8, config: SlotConfig) -> Result<()> {
    let i = index as usize;
    require!(i < SLOT_COUNT, ClawError::InvalidSlotIndex);

    let machine = &mut ctx.accounts.machine;
    validate_slot_config(&config, machine.credit_price_lamports, machine.slots[i].minted)?;

    let slot = &mut machine.slots[i];
    slot.circles = config.circles;
    slot.base_grip_bps = config.base_grip_bps;
    slot.min_grip_bps = config.min_grip_bps;
    slot.sellback_lamports = config.sellback_lamports;
    slot.supply_cap = config.supply_cap;
    slot.name = config.name;
    Ok(())
}
