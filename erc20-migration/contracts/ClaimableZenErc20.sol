// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract ClaimableZenERC20 is ERC20, AccessControl {
    
    bytes32 public constant SET_CLAIM_ROLE = keccak256("SET_CLAIM_ROLE");
    //this link an encoded version of the Zend address in the ethereum formato to the amount they can claim
    mapping(bytes32 => uint256) claimable;
    mapping(bytes32 => bool) claimed;
    //event and errors
    event Claimed(address destAddress, address msgSigner, bytes32 zenAddress, uint256 amount);
    error InvalidSignature();
    error NothingToClaim(address addr);
    error AlreadyClaimed();
    error InvalidLength();

    /* TEST (with bitcoin keys)
    paper wallet: https://bitcoinpaperwallet.io/bitcoinpaperwallet/generate-wallet.html#
    btc addr 1KntkwDsJ4i5eQU5Dce9cGusPLDth5EXAF
    btc priv 5JgPyroC5VB6G54hYZHAVyXSEK6HXrk6Vv9U872vRvNDTgAfbX8

    signed message: 0x5b38da6a701c568545dcfcb03fcb875f56beddc4 (lowercase!)
    https://bitaps.com/signature
    signature: G1UhEIbfHkOpZUQ4eTkUPWAl1hQyY5kYZYNsT2XXum90H1i7xx0/ikjSXi2rrq7GGVMpMD07ygP1a+TAHPowovc=
    https://base64.guru/converter/decode/hex
    sign_hex: 1b55211086df1e43a96544387939143d6025d6143263991865836c4f65d7ba6f741f58bbc71d3f8a48d25e2dabaeaec6195329303d3bca03f56be4c01cfa30a2f7

    check signature returns eth address: 0xdb72a5FafBa49D598d32560efBEe8c0E6Ebca19b
    btc addr was: 1KntkwDsJ4i5eQU5Dce9cGusPLDth5EXAF

    TEST WITH EIP 55
    
    signed message: 0x5B38Da6a701c568545dCfcB03FcB875f56beddC4
    signature: HMx1YZxxs8qXTctAY+ooUYCJPPEW/JP8qnsReXZqCsfucNmhlFTIAWdrA1ZK1nCx3qWaha66kF95tlVIgvBjWJo=
    sign_hex: 1ccc75619c71b3ca974dcb4063ea285180893cf116fc93fcaa7b1179766a0ac7ee70d9a19454c801676b03564ad670b1dea59a85aeba905f79b6554882f063589a
    signature not verified with ecrecover
    */
    bytes SIGNATURE_HEX = "1b55211086df1e43a96544387939143d6025d6143263991865836c4f65d7ba6f741f58bbc71d3f8a48d25e2dabaeaec6195329303d3bca03f56be4c01cfa30a2f7";
    address DEST_ADDRESS = 0x5B38Da6a701c568545dCfcB03FcB875f56beddC4;
    constructor() ERC20("", "") {}
    function test() external view returns(address) {
        return _recoverSignerFromSignature(DEST_ADDRESS, SIGNATURE_HEX);
    }
    //
    
    /*constructor(string memory name, string memory symbol, address claimRole) ERC20(name, symbol) {
        _grantRole(SET_CLAIM_ROLE, claimRole); 
    }*/

    /**
    * Here the admin should insert the zenAddresses decodified from Base58 to bytes32 object with the correspondent amount
    */
    function setClaim(bytes32[] calldata zenAddresses, uint256[] calldata amounts) public onlyRole(SET_CLAIM_ROLE) {
        uint256 i;
        while(i != zenAddresses.length) { //they should be the same length
            claimable[zenAddresses[i]] = amounts[i];
            unchecked { ++i; }
        }
    }
    /**
    * a middle layer extract public key from the signature (it can't be done in solidity!) and pass it to the method
    * we check if it is correct
    */
    function claim(address destAddress, bytes memory decodifiedBase64Signature, bytes memory pubKey) public {
        address msgSigner = _recoverSignerFromSignature(destAddress, decodifiedBase64Signature);
        if(msgSigner == address(0) || msgSigner != pubKeyToEthAddress(pubKey)) revert InvalidSignature();

        bytes32 zenAddress = pubKeyToZenAddress(pubKey);
        if(claimed[zenAddress]) revert AlreadyClaimed();

        uint256 amount = claimable[zenAddress];
        if(amount == 0) revert NothingToClaim(msgSigner);

        _mint(destAddress, amount);
        claimed[zenAddress] = true;
        emit Claimed(destAddress, msgSigner, zenAddress, amount);
    }

    //this replace getPubKeyFromSignature + verifySignature
    function _recoverSignerFromSignature(address destAddress, bytes memory decodifiedBase64Signature) public pure returns(address) {
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(decodifiedBase64Signature, 32))
            s := mload(add(decodifiedBase64Signature, 64))
            v := byte(0, mload(add(decodifiedBase64Signature, 96)))
        }
        // ecrecover
        v -= 27;
        return ecrecover(_messageHash(destAddress), v, r, s);
    }

    function _messageHash(address addr) internal pure returns(bytes32) {
       string memory asString = Strings.toString(uint160(addr)); //return lowercase -> tried with toChecksumHexString but doesn't check signature
       return keccak256(abi.encodePacked(asString));
    }
    function _messageHashEIP55(address addr) internal pure returns(bytes32) {
       string memory asString = Strings.toChecksumHexString(addr);
       return keccak256(abi.encodePacked(asString));
    }

    function pubKeyToEthAddress(bytes memory pubKey) public pure returns (address) {
        if(pubKey.length != 64 && pubKey.length != 65) revert InvalidLength();
        //remove first if 65
        bytes memory trimmedPubKey = pubKey;
        if(pubKey.length == 65) {
            trimmedPubKey = new bytes(64);
            uint256 i;
            while(i != 64) {
                trimmedPubKey[i] = pubKey[i+1];
                unchecked {++i;} 
            }
        }
        bytes32 hash = keccak256(trimmedPubKey);
        return address(uint160(uint256(hash)));
    }

    function pubKeyToZenAddress(bytes memory pubKey) public pure returns (bytes32) { //TO TEST
        //sha
        bytes32 sha = sha256(pubKey);
        bytes32 ripemd = ripemd160(abi.encodePacked(sha));
        return ripemd;
    }

}