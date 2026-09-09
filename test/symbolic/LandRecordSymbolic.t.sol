// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../../contracts/Land_record.sol";

interface Vm {
    function assume(bool condition) external pure;
    function prank(address msgSender) external;
    function expectRevert() external;
}

contract LandRecordSymbolicTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    LandRecord public landRecord;

    function setUp() public {
        landRecord = new LandRecord(3 days);
    }

    /// @dev Formally proves that ANY caller without PAUSER_ROLE cannot pause the contract
    function check_unauthorized_pause_reverts(address caller) public {
        vm.assume(caller != address(this));
        vm.assume(!landRecord.hasRole(landRecord.PAUSER_ROLE(), caller));

        vm.prank(caller);
        vm.expectRevert();
        landRecord.pause();
    }

    /// @dev Formally proves the initial paused state is always false
    function check_initial_paused_state() public view {
        require(!landRecord.paused(), "Initial paused state must be false");
    }
}