%lang starknet

from starkware.cairo.common.cairo_builtins import HashBuiltin
from starkware.cairo.common.uint256 import Uint256

@storage_var
func current_puzzle() -> (puzzle_id : felt):
end

@storage_var
func player_progress(address : felt) -> (progress : Uint256):
end

@external
func solve_puzzle{syscall_ptr : felt*, pedersen_ptr : HashBuiltin*, range_check_ptr}(
    puzzle_id : felt, solution : felt
) -> (success : felt):
    # TODO: Implement puzzle solving logic
    return (success=1)
end

@view
func get_player_progress{syscall_ptr : felt*, pedersen_ptr : HashBuiltin*, range_check_ptr}(
    address : felt
) -> (progress : Uint256):
    let (progress) = player_progress.read(address)
    return (progress)
end

@view
func get_current_puzzle{syscall_ptr : felt*, pedersen_ptr : HashBuiltin*, range_check_ptr}() -> (
    puzzle_id : felt
):
    let (puzzle_id) = current_puzzle.read()
    return (puzzle_id)
end

