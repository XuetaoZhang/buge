// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title BuGe - attendance commitments with deterministic no-show payouts
/// @notice The attendance attestor is an event-specific physical-world oracle.
contract BuGe {
    struct EventData {
        address organizer;
        address attestor;
        uint96 stake;
        uint40 registrationDeadline;
        uint40 checkInDeadline;
        uint40 claimDeadline;
        uint32 registered;
        uint32 present;
        bool finalized;
        uint128 payoutPerAttendee;
    }

    struct Participant {
        bool registered;
        bool present;
        bool claimed;
    }

    uint256 public nextEventId = 1;
    mapping(uint256 => EventData) private events;
    mapping(uint256 => mapping(address => Participant)) private participants;

    event EventCreated(
        uint256 indexed eventId,
        address indexed organizer,
        address indexed attestor,
        uint96 stake,
        uint40 checkInDeadline
    );
    event Registered(uint256 indexed eventId, address indexed attendee);
    event CheckedIn(uint256 indexed eventId, address indexed attendee, address indexed verifier);
    event Finalized(uint256 indexed eventId, uint32 present, uint128 payoutPerAttendee);
    event Claimed(uint256 indexed eventId, address indexed attendee, uint256 amount);

    error UnknownEvent();
    error InvalidWindow();
    error IncorrectStake();
    error AlreadyRegistered();
    error RegistrationClosed();
    error CheckInClosed();
    error NotRegistered();
    error AlreadyCheckedIn();
    error Unauthorized();
    error TooEarly();
    error AlreadyFinalized();
    error NobodyCheckedIn();
    error NotPresent();
    error AlreadyClaimed();
    error ClaimClosed();
    error TransferFailed();

    function createEvent(
        address attestor,
        uint96 stake,
        uint40 registrationDeadline,
        uint40 checkInDeadline,
        uint40 claimDeadline
    ) external returns (uint256 eventId) {
        if (
            attestor == address(0) ||
            stake == 0 ||
            registrationDeadline <= block.timestamp ||
            checkInDeadline <= registrationDeadline ||
            claimDeadline <= checkInDeadline
        ) revert InvalidWindow();

        eventId = nextEventId++;
        events[eventId] = EventData({
            organizer: msg.sender,
            attestor: attestor,
            stake: stake,
            registrationDeadline: registrationDeadline,
            checkInDeadline: checkInDeadline,
            claimDeadline: claimDeadline,
            registered: 0,
            present: 0,
            finalized: false,
            payoutPerAttendee: 0
        });

        emit EventCreated(eventId, msg.sender, attestor, stake, checkInDeadline);
    }

    function register(uint256 eventId) external payable {
        EventData storage item = _event(eventId);
        if (block.timestamp > item.registrationDeadline) revert RegistrationClosed();
        if (msg.value != item.stake) revert IncorrectStake();

        Participant storage participant = participants[eventId][msg.sender];
        if (participant.registered) revert AlreadyRegistered();

        participant.registered = true;
        item.registered += 1;
        emit Registered(eventId, msg.sender);
    }

    /// @notice Fallback for a demo or a self-service event where the attendee signs at the gate.
    function checkInSelf(uint256 eventId) external {
        _checkIn(eventId, msg.sender);
    }

    /// @notice Used by a relayer after it validates an NFC tap or another venue attestation.
    function attestCheckIn(uint256 eventId, address attendee) external {
        EventData storage item = _event(eventId);
        if (msg.sender != item.attestor) revert Unauthorized();
        _checkIn(eventId, attendee);
    }

    function finalize(uint256 eventId) external {
        EventData storage item = _event(eventId);
        if (block.timestamp <= item.checkInDeadline) revert TooEarly();
        if (item.finalized) revert AlreadyFinalized();
        if (item.present == 0) revert NobodyCheckedIn();

        item.finalized = true;
        item.payoutPerAttendee = uint128((uint256(item.stake) * item.registered) / item.present);
        emit Finalized(eventId, item.present, item.payoutPerAttendee);
    }

    function claim(uint256 eventId) external {
        EventData storage item = _event(eventId);
        if (!item.finalized) revert TooEarly();
        if (block.timestamp > item.claimDeadline) revert ClaimClosed();

        Participant storage participant = participants[eventId][msg.sender];
        if (!participant.present) revert NotPresent();
        if (participant.claimed) revert AlreadyClaimed();

        participant.claimed = true;
        uint256 amount = item.payoutPerAttendee;
        (bool sent,) = payable(msg.sender).call{value: amount}("");
        if (!sent) revert TransferFailed();
        emit Claimed(eventId, msg.sender, amount);
    }

    function eventDetails(uint256 eventId) external view returns (EventData memory) {
        return _event(eventId);
    }

    function participantDetails(uint256 eventId, address attendee) external view returns (Participant memory) {
        _event(eventId);
        return participants[eventId][attendee];
    }

    function _checkIn(uint256 eventId, address attendee) private {
        EventData storage item = _event(eventId);
        if (block.timestamp > item.checkInDeadline) revert CheckInClosed();

        Participant storage participant = participants[eventId][attendee];
        if (!participant.registered) revert NotRegistered();
        if (participant.present) revert AlreadyCheckedIn();

        participant.present = true;
        item.present += 1;
        emit CheckedIn(eventId, attendee, msg.sender);
    }

    function _event(uint256 eventId) private view returns (EventData storage item) {
        item = events[eventId];
        if (item.organizer == address(0)) revert UnknownEvent();
    }
}
