// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.0;

library VerificationLibrary {

    error InvalidSignature();

    struct Signature {
        bytes32 r;
        bytes32 s;
        uint8 v;
    }

    function parseZendSignature(bytes memory decodifiedBase64Signature) internal pure returns (Signature memory){
        require(decodifiedBase64Signature.length == 65, "Signature must be 65 bytes long");
        bytes32 r;
        bytes32 s;
        uint8 v = uint8(decodifiedBase64Signature[0]);
        assembly {       
            r := mload(add(decodifiedBase64Signature, 33)) //  bytes 1-33
            s := mload(add(decodifiedBase64Signature, 65)) // bytes 33-65 bytes
        }
        return Signature({r: r, s: s, v: v});
    }

    function verifyZendSignature(bytes32 messageHash, Signature memory signature, bytes32 pubKeyX, bytes32 pubKeyY) internal pure {
        uint8 v_ethereumFormat;
        if (signature.v == 31 || signature.v==32){
            //zend signature from compressed pubkey has +4 but ethereum does not expect this
            v_ethereumFormat = signature.v - 4;
        }else{
            v_ethereumFormat = signature.v;
        }
        address msgSigner = ecrecover(messageHash, v_ethereumFormat, signature.r, signature.s);
        if(msgSigner == address(0) || msgSigner != pubKeyToEthAddress(pubKeyX, pubKeyY)) revert InvalidSignature();
    }

    function createMessageHash(string memory message) internal pure returns(bytes32) {
        string memory messageMagicString = "Zcash Signed Message:\n";
        // Conversione in bytes
        bytes memory messageMagicBytes = bytes(messageMagicString);
        bytes memory messageToSignBytes = bytes(message);
        
        bytes memory mmb2 = abi.encodePacked(uint8(messageMagicBytes.length), messageMagicBytes);
        bytes memory mts2 = abi.encodePacked(uint8(messageToSignBytes.length), messageToSignBytes);
       
        // Concatenazione dei due array
        bytes memory combinedMessage = abi.encodePacked(mmb2, mts2);
        
        // Double SHA-256 hashing
        return sha256(abi.encodePacked(sha256(combinedMessage)));
    }

    function pubKeyToEthAddress(bytes32 pubKeyX, bytes32 pubKeyY) internal pure returns (address) {
        bytes32 hash = keccak256(abi.encodePacked(pubKeyX, pubKeyY));
        return address(uint160(uint256(hash)));
    }


    function pubKeyUncompressedToZenAddress(bytes32 pubKeyX, bytes32 pubKeyY) internal pure returns (bytes20) {
        return ripemd160(abi.encodePacked(sha256(abi.encodePacked(hex"04", pubKeyX, pubKeyY))));
    }

    function pubKeyCompressedToZenAddress(bytes32 xPubKeyBE, uint8 sign) internal pure returns (bytes20) {
        return ripemd160(abi.encodePacked(sha256(abi.encodePacked(sign, xPubKeyBE))));
    }

    function signByte(bytes32 yPubKeyBE) internal pure returns (uint8) {
        uint256 yPub = uint256(yPubKeyBE);
        if (yPub % 2 == 0) {
            return 0x02;
        } else {
            return 0x03;
        }
    }
}