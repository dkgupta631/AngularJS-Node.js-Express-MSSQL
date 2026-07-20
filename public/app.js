(function () {
  'use strict';

  angular.module('productApp', []).controller('ProductController', function ($http) {
    var vm = this;
    vm.products = [];
    vm.loading = true;
    vm.form = {};

    vm.load = function () {
      vm.loading = true;
      $http.get('/api/products').then(function (response) {
        vm.products = response.data;
      }).catch(showError).finally(function () { vm.loading = false; });
    };

    vm.openCreate = function () { vm.editing = null; vm.form = { price: 0, stock: 0, description: '' }; vm.showForm = true; };
    vm.openEdit = function (product) { vm.editing = product.id; vm.form = angular.copy(product); vm.showForm = true; };
    vm.closeForm = function () { vm.showForm = false; vm.form = {}; };

    vm.save = function (form) {
      if (form.$invalid) return;
      vm.saving = true;
      var request = vm.editing ? $http.put('/api/products/' + vm.editing, vm.form) : $http.post('/api/products', vm.form);
      request.then(function () {
        vm.message = vm.editing ? 'Product updated.' : 'Product created.';
        vm.closeForm(); vm.load();
      }).catch(showError).finally(function () { vm.saving = false; });
    };

    vm.remove = function (product) {
      if (!window.confirm('Delete "' + product.name + '"?')) return;
      $http.delete('/api/products/' + product.id).then(function () {
        vm.message = 'Product deleted.'; vm.load();
      }).catch(showError);
    };

    function showError(response) { vm.error = (response.data && response.data.error) || 'Something went wrong. Please try again.'; }
    vm.load();
  });

  angular.module('productApp').controller('ChatController', function ($http) {
    var vm = this;
    vm.rooms = [];
    vm.messages = [];
    vm.currentRoomId = null;
    vm.form = { sender: 'You', message: '' };
    vm.socket = io();
    vm.socketConnected = true;

    vm.loadRooms = function () {
      $http.get('/api/chat/rooms').then(function (response) {
        vm.rooms = response.data;
        if (!vm.rooms.length) {
          vm.chatError = 'No chat room is available yet.';
          return;
        }

        if (!vm.currentRoomId) {
          vm.currentRoomId = vm.rooms[0].id;
        }

        vm.selectRoom(vm.currentRoomId);
      }).catch(function (response) {
        vm.chatError = (response.data && response.data.error) || 'Unable to load chat rooms.';
      });
    };

    vm.selectRoom = function (roomId) {
      if (vm.currentRoomId && vm.currentRoomId !== roomId) {
        vm.socket.emit('chat:leave-room', vm.currentRoomId);
      }

      vm.currentRoomId = Number(roomId);
      vm.messages = [];
      vm.socket.emit('chat:join-room', vm.currentRoomId);

      $http.get('/api/chat/rooms/' + vm.currentRoomId + '/messages').then(function (response) {
        vm.messages = response.data;
      }).catch(function (response) {
        vm.chatError = (response.data && response.data.error) || 'Unable to load messages.';
      });
    };

    vm.sendMessage = function (form) {
      if (form.$invalid) return;
      vm.chatError = '';
      $http.post('/api/chat/rooms/' + vm.currentRoomId + '/messages', {
        roomId: vm.currentRoomId,
        sender: vm.form.sender,
        message: vm.form.message
      }).then(function (response) {
        vm.form.message = '';
        vm.messages.push(response.data);
      }).catch(function (response) {
        vm.chatError = (response.data && response.data.error) || 'Unable to send message.';
      });
    };

    vm.socket.on('chat:message', function (message) {
      if (Number(message.roomId) !== Number(vm.currentRoomId)) return;
      vm.messages.push(message);
    });

    vm.loadRooms();
  });
}());
